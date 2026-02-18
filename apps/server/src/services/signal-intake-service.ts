/**
 * Signal Intake Service
 *
 * Bridges external signals (Linear issues, GitHub issues, Discord messages)
 * to the PM Agent pipeline. Subscribes to `signal:received` events from
 * IntegrationService and creates features with `workItemState: 'idea'`,
 * triggering the PM Agent research → PRD → decomposition flow.
 */

import { createLogger } from '@automaker/utils';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';

const logger = createLogger('SignalIntake');

interface SignalPayload {
  source: string;
  content: string;
  author: {
    id: string;
    name: string;
  };
  channelContext?: {
    channelId?: string;
    channelName?: string;
    issueId?: string;
    state?: string;
    [key: string]: unknown;
  };
  timestamp: string;
}

export class SignalIntakeService {
  private processedSignals = new Set<string>();

  constructor(
    private events: EventEmitter,
    private featureLoader: FeatureLoader,
    private defaultProjectPath: string
  ) {
    this.registerListener();
    logger.info(`Signal intake service initialized for ${defaultProjectPath}`);
  }

  private registerListener(): void {
    this.events.subscribe((type, payload) => {
      if (type === 'signal:received') {
        void this.handleSignal(payload as SignalPayload);
      }
    });
  }

  private async handleSignal(signal: SignalPayload): Promise<void> {
    // Deduplicate by source + author ID (e.g., same Linear issue ID)
    const dedupeKey = `${signal.source}:${signal.author.id}`;
    if (this.processedSignals.has(dedupeKey)) {
      logger.debug(`Skipping duplicate signal: ${dedupeKey}`);
      return;
    }
    this.processedSignals.add(dedupeKey);

    // Prevent unbounded growth — trim older entries after 1000
    if (this.processedSignals.size > 1000) {
      const entries = [...this.processedSignals];
      this.processedSignals = new Set(entries.slice(-500));
    }

    try {
      // Extract title from first line, description from full content
      const lines = signal.content.split('\n').filter((l) => l.trim());
      const title = (lines[0] || 'Untitled signal').substring(0, 100);
      const description = signal.content;

      logger.info(`Processing signal from ${signal.source}: "${title}"`);

      // Create feature with idea state
      const feature = await this.featureLoader.create(this.defaultProjectPath, {
        title: `[${signal.source}] ${title}`,
        description,
        status: 'backlog',
        category: 'Signal Intake',
        complexity: 'medium',
        workItemState: 'idea',
      });

      // Trigger PM Agent pipeline
      this.events.emit('authority:idea-injected', {
        projectPath: this.defaultProjectPath,
        featureId: feature.id,
        title,
        description,
        injectedBy: `signal:${signal.source}`,
        injectedAt: new Date().toISOString(),
      });

      logger.info(
        `Signal routed to PM Agent: "${title}" → feature ${feature.id} (source: ${signal.source})`
      );
    } catch (error) {
      logger.error(`Failed to process signal from ${signal.source}:`, error);
    }
  }
}
