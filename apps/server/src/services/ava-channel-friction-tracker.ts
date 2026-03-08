import { createLogger } from '@protolabsai/utils';

const logger = createLogger('AvaChannelFriction');

export interface FrictionPattern {
  /** Unique key for this pattern (e.g., 'handler-missing:coordination', 'handler-failed:help-request') */
  key: string;
  /** Human-readable description */
  description: string;
  /** Number of times observed */
  count: number;
  /** When first seen */
  firstSeen: string;
  /** When last seen */
  lastSeen: string;
  /** Example message IDs that triggered this pattern */
  examples: string[];
}

export interface FrictionTrackerDeps {
  /** Function to create a feature on the board. Takes title + description, returns feature ID or null on failure. */
  createFeature?: (title: string, description: string) => Promise<string | null>;
  /** Project slug for the system-improvements project */
  systemImprovementsSlug?: string;
}

const PATTERN_THRESHOLD = 3;
const MAX_EXAMPLES = 5;

export class AvaChannelFrictionTracker {
  private readonly patterns = new Map<string, FrictionPattern>();
  private readonly filedPatterns = new Set<string>();
  private readonly deps: FrictionTrackerDeps;

  constructor(deps: FrictionTrackerDeps = {}) {
    this.deps = deps;
  }

  recordFriction(key: string, description: string, messageId: string): void {
    const now = new Date().toISOString();
    const existing = this.patterns.get(key);

    if (existing) {
      existing.count++;
      existing.lastSeen = now;
      if (existing.examples.length < MAX_EXAMPLES) {
        existing.examples.push(messageId);
      }
    } else {
      this.patterns.set(key, {
        key,
        description,
        count: 1,
        firstSeen: now,
        lastSeen: now,
        examples: [messageId],
      });
    }

    const pattern = this.patterns.get(key)!;

    if (pattern.count >= PATTERN_THRESHOLD && !this.filedPatterns.has(key)) {
      this.filedPatterns.add(key);
      this.autoFileFeature(pattern).catch((err) => {
        logger.error(`Failed to auto-file feature for friction pattern "${key}"`, err);
      });
    }
  }

  async autoFileFeature(pattern: FrictionPattern): Promise<void> {
    if (!this.deps.createFeature) {
      logger.warn(
        `Friction pattern "${pattern.key}" hit threshold (${pattern.count}) but no createFeature dep available`,
      );
      return;
    }

    const title = `[System Improvement] Fix recurring friction: ${pattern.description}`;
    const description = [
      `## Recurring Friction Pattern Detected`,
      '',
      `**Pattern key:** \`${pattern.key}\``,
      `**Description:** ${pattern.description}`,
      `**Occurrences:** ${pattern.count}`,
      `**First seen:** ${pattern.firstSeen}`,
      `**Last seen:** ${pattern.lastSeen}`,
      `**Example message IDs:** ${pattern.examples.map((id) => `\`${id}\``).join(', ')}`,
      '',
      `## Suggested Fix`,
      '',
      `Investigate why this pattern keeps occurring and implement a handler or rule to address it.`,
    ].join('\n');

    const featureId = await this.deps.createFeature(title, description);

    if (featureId) {
      logger.info(`Auto-filed feature ${featureId} for friction pattern "${pattern.key}"`);
    } else {
      logger.error(`createFeature returned null for friction pattern "${pattern.key}"`);
    }
  }

  getPatterns(): FrictionPattern[] {
    return Array.from(this.patterns.values()).sort((a, b) => b.count - a.count);
  }

  getMetrics(): {
    patternsDetected: number;
    featuresAutoFiled: number;
    totalFrictionEvents: number;
  } {
    let totalFrictionEvents = 0;
    for (const pattern of this.patterns.values()) {
      totalFrictionEvents += pattern.count;
    }

    return {
      patternsDetected: this.patterns.size,
      featuresAutoFiled: this.filedPatterns.size,
      totalFrictionEvents,
    };
  }

  reset(): void {
    this.patterns.clear();
    this.filedPatterns.clear();
  }
}
