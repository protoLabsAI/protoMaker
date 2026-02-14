/**
 * Feedback Pattern Detector Service
 *
 * Detects recurring patterns in PR review feedback:
 * - Same category appearing 3+ times
 * - Same file being flagged repeatedly
 * - Emits escalation signals to create Linear issues for systemic review
 *
 * Works in conjunction with FeedbackAnalyticsService to analyze trends.
 */

import { createLogger } from '@automaker/utils';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { EventEmitter } from '../lib/events.js';
import type {
  FeedbackAnalyticsService,
  FilePattern,
  CategoryPattern,
} from './feedback-analytics-service.js';

const logger = createLogger('FeedbackPatternDetector');

/** Threshold for triggering escalation */
const PATTERN_THRESHOLD = 3;

export interface DetectedPattern {
  type: 'file' | 'category' | 'file-category';
  description: string;
  occurrences: number;
  threshold: number;
  details: {
    file?: string;
    category?: string;
    firstSeen: string;
    lastSeen: string;
  };
  escalated: boolean;
  escalatedAt?: string;
  linearIssueUrl?: string;
}

export interface PatternDetectionResult {
  patterns: DetectedPattern[];
  newEscalations: DetectedPattern[];
}

export class FeedbackPatternDetector {
  private events: EventEmitter;
  private analyticsDir: string;
  private patternsFile: string;
  private detectedPatterns: Map<string, DetectedPattern> = new Map();

  constructor(projectPath: string, events: EventEmitter) {
    this.events = events;
    this.analyticsDir = join(projectPath, '.automaker', 'analytics');
    this.patternsFile = join(this.analyticsDir, 'detected-patterns.json');
  }

  /**
   * Initialize by loading previously detected patterns
   */
  async initialize(): Promise<void> {
    try {
      const data = await readFile(this.patternsFile, 'utf-8');
      const patterns: DetectedPattern[] = JSON.parse(data);

      for (const pattern of patterns) {
        const key = this.getPatternKey(pattern);
        this.detectedPatterns.set(key, pattern);
      }

      logger.info(`Loaded ${this.detectedPatterns.size} previously detected patterns`);
    } catch {
      // File doesn't exist yet, start fresh
      logger.debug('No existing patterns file found, starting fresh');
    }
  }

  /**
   * Detect patterns from analytics service
   */
  async detectPatterns(
    analyticsService: FeedbackAnalyticsService
  ): Promise<PatternDetectionResult> {
    logger.info('Running pattern detection...');

    const newEscalations: DetectedPattern[] = [];

    // Analyze file patterns
    const filePatterns = analyticsService.getFilePatterns();
    for (const [file, pattern] of filePatterns.entries()) {
      if (pattern.totalOccurrences >= PATTERN_THRESHOLD) {
        const detected = await this.recordFilePattern(file, pattern);
        if (detected) {
          newEscalations.push(detected);
        }
      }
    }

    // Analyze category patterns
    const categoryPatterns = analyticsService.getCategoryPatterns();
    for (const [category, pattern] of categoryPatterns.entries()) {
      if (pattern.totalOccurrences >= PATTERN_THRESHOLD) {
        const detected = await this.recordCategoryPattern(category, pattern);
        if (detected) {
          newEscalations.push(detected);
        }
      }
    }

    // Analyze file-category combinations
    for (const [file, filePattern] of filePatterns.entries()) {
      for (const [category, count] of filePattern.categories.entries()) {
        if (count >= PATTERN_THRESHOLD) {
          const detected = await this.recordFileCategoryPattern(file, category, count, filePattern);
          if (detected) {
            newEscalations.push(detected);
          }
        }
      }
    }

    // Save patterns
    await this.savePatterns();

    // Emit escalation events for new patterns
    for (const pattern of newEscalations) {
      await this.emitEscalation(pattern);
    }

    logger.info(
      `Pattern detection complete: ${this.detectedPatterns.size} total patterns, ${newEscalations.length} new escalations`
    );

    return {
      patterns: Array.from(this.detectedPatterns.values()),
      newEscalations,
    };
  }

  /**
   * Record a file pattern (same file flagged 3+ times)
   */
  private async recordFilePattern(
    file: string,
    pattern: FilePattern
  ): Promise<DetectedPattern | null> {
    const key = `file:${file}`;
    const existing = this.detectedPatterns.get(key);

    if (existing) {
      // Update existing pattern
      existing.occurrences = pattern.totalOccurrences;
      existing.details.lastSeen = pattern.lastSeen;
      return null; // Already escalated
    }

    // New pattern detected
    const detected: DetectedPattern = {
      type: 'file',
      description: `File "${file}" has been flagged ${pattern.totalOccurrences} times across multiple PRs`,
      occurrences: pattern.totalOccurrences,
      threshold: PATTERN_THRESHOLD,
      details: {
        file,
        firstSeen: pattern.firstSeen,
        lastSeen: pattern.lastSeen,
      },
      escalated: false,
    };

    this.detectedPatterns.set(key, detected);
    logger.info(`New file pattern detected: ${file} (${pattern.totalOccurrences} occurrences)`);

    return detected;
  }

  /**
   * Record a category pattern (same category appearing 3+ times)
   */
  private async recordCategoryPattern(
    category: string,
    pattern: CategoryPattern
  ): Promise<DetectedPattern | null> {
    const key = `category:${category}`;
    const existing = this.detectedPatterns.get(key);

    if (existing) {
      // Update existing pattern
      existing.occurrences = pattern.totalOccurrences;
      existing.details.lastSeen = pattern.lastSeen;
      return null; // Already escalated
    }

    // New pattern detected
    const detected: DetectedPattern = {
      type: 'category',
      description: `Feedback category "${category}" has appeared ${pattern.totalOccurrences} times across ${pattern.files.size} files`,
      occurrences: pattern.totalOccurrences,
      threshold: PATTERN_THRESHOLD,
      details: {
        category,
        firstSeen: pattern.firstSeen,
        lastSeen: pattern.lastSeen,
      },
      escalated: false,
    };

    this.detectedPatterns.set(key, detected);
    logger.info(
      `New category pattern detected: ${category} (${pattern.totalOccurrences} occurrences)`
    );

    return detected;
  }

  /**
   * Record a file-category combination pattern
   */
  private async recordFileCategoryPattern(
    file: string,
    category: string,
    count: number,
    filePattern: FilePattern
  ): Promise<DetectedPattern | null> {
    const key = `file-category:${file}:${category}`;
    const existing = this.detectedPatterns.get(key);

    if (existing) {
      // Update existing pattern
      existing.occurrences = count;
      existing.details.lastSeen = filePattern.lastSeen;
      return null; // Already escalated
    }

    // New pattern detected
    const detected: DetectedPattern = {
      type: 'file-category',
      description: `File "${file}" has been flagged ${count} times for "${category}" issues`,
      occurrences: count,
      threshold: PATTERN_THRESHOLD,
      details: {
        file,
        category,
        firstSeen: filePattern.firstSeen,
        lastSeen: filePattern.lastSeen,
      },
      escalated: false,
    };

    this.detectedPatterns.set(key, detected);
    logger.info(`New file-category pattern detected: ${file} / ${category} (${count} occurrences)`);

    return detected;
  }

  /**
   * Emit escalation event to create Linear issue
   */
  private async emitEscalation(pattern: DetectedPattern): Promise<void> {
    logger.info(`Emitting escalation for pattern: ${pattern.description}`);

    // Emit event for Linear issue creation
    this.events.emit('feedback:pattern-detected', {
      pattern,
      suggestedTitle: this.generateIssueTitle(pattern),
      suggestedDescription: this.generateIssueDescription(pattern),
    });

    // Mark as escalated
    pattern.escalated = true;
    pattern.escalatedAt = new Date().toISOString();
  }

  /**
   * Generate Linear issue title from pattern
   */
  private generateIssueTitle(pattern: DetectedPattern): string {
    switch (pattern.type) {
      case 'file':
        return `Systemic Review: File ${pattern.details.file} flagged ${pattern.occurrences}x`;
      case 'category':
        return `Systemic Review: ${pattern.details.category} feedback recurring ${pattern.occurrences}x`;
      case 'file-category':
        return `Systemic Review: ${pattern.details.file} flagged ${pattern.occurrences}x for ${pattern.details.category}`;
      default:
        return `Systemic Review: Recurring pattern detected`;
    }
  }

  /**
   * Generate Linear issue description from pattern
   */
  private generateIssueDescription(pattern: DetectedPattern): string {
    const details = [];
    details.push(`## Pattern Detected\n`);
    details.push(`**Type:** ${pattern.type}`);
    details.push(`**Occurrences:** ${pattern.occurrences} (threshold: ${pattern.threshold})`);
    details.push(`**First Seen:** ${pattern.details.firstSeen}`);
    details.push(`**Last Seen:** ${pattern.details.lastSeen}`);

    if (pattern.details.file) {
      details.push(`**File:** \`${pattern.details.file}\``);
    }

    if (pattern.details.category) {
      details.push(`**Category:** ${pattern.details.category}`);
    }

    details.push(`\n## Description\n`);
    details.push(pattern.description);

    details.push(`\n## Recommendation\n`);
    details.push(`This recurring pattern suggests a systemic issue that may require:`);
    details.push(`- Code refactoring or architectural changes`);
    details.push(`- Documentation updates`);
    details.push(`- Team training or guidelines`);
    details.push(`- Linting or tooling improvements`);

    return details.join('\n');
  }

  /**
   * Get pattern key for deduplication
   */
  private getPatternKey(pattern: DetectedPattern): string {
    switch (pattern.type) {
      case 'file':
        return `file:${pattern.details.file}`;
      case 'category':
        return `category:${pattern.details.category}`;
      case 'file-category':
        return `file-category:${pattern.details.file}:${pattern.details.category}`;
      default:
        return `unknown:${JSON.stringify(pattern.details)}`;
    }
  }

  /**
   * Save detected patterns to disk
   */
  private async savePatterns(): Promise<void> {
    try {
      await mkdir(this.analyticsDir, { recursive: true });

      const patterns = Array.from(this.detectedPatterns.values());
      await writeFile(this.patternsFile, JSON.stringify(patterns, null, 2));

      logger.debug(`Patterns saved to ${this.patternsFile}`);
    } catch (error) {
      logger.error('Failed to save patterns:', error);
      throw error;
    }
  }

  /**
   * Get all detected patterns
   */
  getDetectedPatterns(): DetectedPattern[] {
    return Array.from(this.detectedPatterns.values());
  }

  /**
   * Mark pattern as having a Linear issue created
   */
  async markPatternEscalated(patternKey: string, linearIssueUrl: string): Promise<void> {
    const pattern = this.detectedPatterns.get(patternKey);
    if (pattern) {
      pattern.linearIssueUrl = linearIssueUrl;
      pattern.escalated = true;
      pattern.escalatedAt = new Date().toISOString();
      await this.savePatterns();
      logger.info(`Pattern ${patternKey} marked as escalated with Linear issue: ${linearIssueUrl}`);
    }
  }
}
