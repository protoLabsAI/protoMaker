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
    labels?: string[];
    projectId?: string;
    [key: string]: unknown;
  };
  timestamp: string;
}

type SignalCategory = 'ops' | 'gtm';

interface ClassificationResult {
  category: SignalCategory;
  reason: string;
}

interface SignalCounts {
  linear: number;
  github: number;
  discord: number;
  mcp: number;
}

export interface SignalIntakeStatus {
  active: boolean;
  signalCounts: SignalCounts;
  lastSignalAt: string | null;
}

export class SignalIntakeService {
  private processedSignals = new Set<string>();
  private signalCounts: SignalCounts = {
    linear: 0,
    github: 0,
    discord: 0,
    mcp: 0,
  };
  private lastSignalAt: string | null = null;

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

  /**
   * Get current signal intake status
   */
  public getStatus(): SignalIntakeStatus {
    return {
      active: true,
      signalCounts: { ...this.signalCounts },
      lastSignalAt: this.lastSignalAt,
    };
  }

  /**
   * Increment signal count by source
   */
  private incrementSignalCount(source: string): void {
    // Normalize source to known categories
    if (source === 'linear') {
      this.signalCounts.linear++;
    } else if (source === 'github') {
      this.signalCounts.github++;
    } else if (source === 'discord') {
      this.signalCounts.discord++;
    } else if (source.startsWith('mcp')) {
      this.signalCounts.mcp++;
    }
    // Unknown sources are silently ignored
  }

  /**
   * Classify signal as Ops (engineering) or GTM (marketing)
   */
  private classifySignal(signal: SignalPayload): ClassificationResult {
    const source = signal.source;
    const channelContext = signal.channelContext || {};

    // GitHub events → always Ops
    if (source === 'github') {
      return { category: 'ops', reason: 'GitHub events are engineering work' };
    }

    // MCP create_feature → always Ops (fast path)
    if (source === 'mcp:create_feature') {
      return { category: 'ops', reason: 'MCP create_feature is engineering work' };
    }

    // MCP process_idea → Ops with PM pipeline
    if (source === 'mcp:process_idea') {
      return { category: 'ops', reason: 'MCP process_idea routes through PM pipeline' };
    }

    // Linear signals classified by label/project
    if (source === 'linear') {
      const labels = (channelContext.labels as string[]) || [];
      const _projectId = channelContext.projectId as string | undefined;

      // Check for GTM labels
      const gtmLabels = ['marketing', 'content', 'social', 'gtm', 'campaign', 'seo'];
      const hasGtmLabel = labels.some((label) =>
        gtmLabels.some((gtmLabel) => label.toLowerCase().includes(gtmLabel))
      );

      if (hasGtmLabel) {
        return { category: 'gtm', reason: `Linear issue has GTM label: ${labels.join(', ')}` };
      }

      // Check for Ops labels
      const opsLabels = ['bug', 'feature', 'enhancement', 'engineering', 'ops', 'infra'];
      const hasOpsLabel = labels.some((label) =>
        opsLabels.some((opsLabel) => label.toLowerCase().includes(opsLabel))
      );

      if (hasOpsLabel) {
        return { category: 'ops', reason: `Linear issue has Ops label: ${labels.join(', ')}` };
      }

      // Default to Ops for Linear (engineering is primary use case)
      return { category: 'ops', reason: 'Linear issue defaults to Ops (no GTM labels found)' };
    }

    // Discord messages classified by channel
    if (source === 'discord') {
      const channelName = (channelContext.channelName as string | undefined)?.toLowerCase() || '';

      // GTM channels
      const gtmChannels = ['marketing', 'social', 'content', 'gtm', 'campaign'];
      if (gtmChannels.some((ch) => channelName.includes(ch))) {
        return { category: 'gtm', reason: `Discord channel is GTM: ${channelName}` };
      }

      // Ops channels
      const opsChannels = ['dev', 'infra', 'engineering', 'ops', 'tech'];
      if (opsChannels.some((ch) => channelName.includes(ch))) {
        return { category: 'ops', reason: `Discord channel is Ops: ${channelName}` };
      }

      // Default to Ops for Discord (engineering is primary use case)
      return { category: 'ops', reason: 'Discord message defaults to Ops (no GTM channel found)' };
    }

    // Default: all other signals → Ops
    return { category: 'ops', reason: 'Default classification: Ops' };
  }

  private async handleSignal(signal: SignalPayload): Promise<void> {
    // Deduplicate by source + unique identifier.
    // For integration sources (Linear, GitHub), use author.id which is the issue/event ID.
    // For UI/MCP sources, include timestamp to allow repeat submissions.
    const isUserSource = signal.source.startsWith('ui:') || signal.source.startsWith('mcp:');
    const dedupeKey = isUserSource
      ? `${signal.source}:${signal.timestamp}`
      : `${signal.source}:${signal.author.id}`;
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

    // Track signal receipt
    this.lastSignalAt = signal.timestamp;
    this.incrementSignalCount(signal.source);

    try {
      // Extract title from first line, description from full content
      const lines = signal.content.split('\n').filter((l) => l.trim());
      const title = (lines[0] || 'Untitled signal').substring(0, 100);
      const description = signal.content;

      // Classify signal as Ops or GTM
      const classification = this.classifySignal(signal);

      logger.info(
        `Processing signal from ${signal.source}: "${title}" (${classification.category} - ${classification.reason})`
      );

      // GTM signals: log and park (manual handling for now)
      if (classification.category === 'gtm') {
        logger.info(`GTM signal parked for manual handling: "${title}" (source: ${signal.source})`);
        this.events.emit('signal:routed', {
          projectPath: this.defaultProjectPath,
          title,
          description,
          category: 'gtm',
          reason: classification.reason,
          source: signal.source,
          timestamp: signal.timestamp,
        });
        return;
      }

      // Ops signals: route to Lead Engineer state machine
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
        autoApprove: signal.channelContext?.autoApprove as boolean | undefined,
      });

      // Emit routing event for observability
      this.events.emit('signal:routed', {
        projectPath: this.defaultProjectPath,
        featureId: feature.id,
        title,
        description,
        category: 'ops',
        reason: classification.reason,
        source: signal.source,
        timestamp: signal.timestamp,
      });

      logger.info(
        `Ops signal routed to Lead Engineer: "${title}" → feature ${feature.id} (source: ${signal.source})`
      );
    } catch (error) {
      logger.error(`Failed to process signal from ${signal.source}:`, error);
    }
  }

  /**
   * Public method for submitting signals from the UI or API.
   * Emits signal:received so the standard processing pipeline handles it.
   */
  public submitSignal(params: {
    source: string;
    content: string;
    projectPath?: string;
    images?: string[];
    files?: string[];
    autoApprove?: boolean;
  }): void {
    // Enrich content with file and image references
    let enrichedContent = params.content;

    if (params.files && params.files.length > 0) {
      enrichedContent += '\n\n## Attached Files\n' + params.files.map((f) => `- ${f}`).join('\n');
    }

    if (params.images && params.images.length > 0) {
      enrichedContent +=
        '\n\n## Attached Images\n' + params.images.map((img) => `- ${img}`).join('\n');
    }

    const signal: SignalPayload = {
      source: params.source,
      content: enrichedContent,
      author: { id: 'ui-user', name: 'UI User' },
      channelContext: {
        projectPath: params.projectPath,
        images: params.images,
        files: params.files,
        autoApprove: params.autoApprove,
      },
      timestamp: new Date().toISOString(),
    };
    this.events.emit('signal:received', signal);
  }
}
