/**
 * Signal Intake Service
 *
 * Bridges external signals (Linear issues, GitHub issues, Discord messages)
 * to the PM Agent pipeline. Subscribes to `signal:received` events from
 * IntegrationService and creates features with `workItemState: 'idea'`,
 * triggering the PM Agent research → PRD → decomposition flow.
 */

import { createLogger } from '@protolabs-ai/utils';
import type { HITLFormRequestInput } from '@protolabs-ai/types';
import type { SignalIntent } from '@protolabs-ai/types';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';
import type { SettingsService } from './settings-service.js';

const logger = createLogger('SignalIntake');

/** Minimal interface for HITL form creation (avoids tight coupling to HITLFormService) */
interface HITLFormCreator {
  create(input: HITLFormRequestInput): { id: string };
}

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
    projectPath?: string;
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
  private hitlFormService: HITLFormCreator | null = null;

  constructor(
    private events: EventEmitter,
    private featureLoader: FeatureLoader,
    private defaultProjectPath: string,
    private settingsService?: SettingsService
  ) {
    this.registerListener();
    logger.info(`Signal intake service initialized for ${defaultProjectPath}`);
  }

  /**
   * Wire in a HITL form creator for interrupt signal handling.
   * When set, interrupt-intent signals bypass the PM pipeline and create a HITL form directly.
   */
  setHITLFormService(service: HITLFormCreator): void {
    this.hitlFormService = service;
    logger.info('HITLFormService wired into SignalIntakeService');
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
   * Classify signal as Ops (engineering) or GTM (marketing).
   * When gtmEnabled is false in settings, all signals are forced to ops.
   */
  private async classifySignal(signal: SignalPayload): Promise<ClassificationResult> {
    // Gate: if GTM pipeline is disabled, force all signals to ops
    if (this.settingsService) {
      const settings = await this.settingsService.getGlobalSettings();
      if (!settings.gtmEnabled) {
        return { category: 'ops', reason: 'GTM pipeline disabled in settings' };
      }
    }

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

    // UI content creation toggle → always GTM
    if (signal.source === 'ui:content') {
      return { category: 'gtm', reason: 'Content creation signal from UI' };
    }

    // Default: all other signals → Ops
    return { category: 'ops', reason: 'Default classification: Ops' };
  }

  /**
   * Classify the intent behind an incoming signal.
   *
   * Inspects the signal source and channelContext trigger metadata to determine
   * what kind of action the signal is requesting. This is distinct from ops/gtm
   * routing (which decides team ownership) — intent classifies the nature of the
   * signal itself for fine-grained handling within each route.
   *
   * Intent taxonomy:
   *   work_order     - Concrete task or feature request ready for implementation.
   *   idea           - Vague concept needing PM refinement before becoming actionable.
   *   feedback       - Commentary on existing work; not a new task.
   *   conversational - Casual message or question; does not create a work item.
   *   interrupt      - Urgent signal requiring immediate human attention; bypasses PM pipeline.
   */
  classifySignalIntent(signal: SignalPayload): SignalIntent {
    const source = signal.source;
    const channelContext = signal.channelContext || {};
    const labels = (channelContext.labels as string[] | undefined) ?? [];
    const channelName = ((channelContext.channelName as string | undefined) ?? '').toLowerCase();
    const trigger = ((channelContext.trigger as string | undefined) ?? '').toLowerCase();

    // MCP sources: intent is explicit in the source name
    if (source === 'mcp:create_feature') {
      return 'work_order';
    }
    if (source === 'mcp:process_idea') {
      return 'idea';
    }

    // Interrupt signals: urgent/alert keywords in channel or trigger metadata
    const interruptKeywords = [
      'interrupt',
      'urgent',
      'alert',
      'outage',
      'incident',
      'down',
      'critical',
    ];
    if (
      interruptKeywords.some((kw) => channelName.includes(kw)) ||
      interruptKeywords.some((kw) => trigger.includes(kw)) ||
      labels.some((l) => interruptKeywords.some((kw) => l.toLowerCase().includes(kw)))
    ) {
      return 'interrupt';
    }

    // GitHub issues are always work orders
    if (source === 'github') {
      return 'work_order';
    }

    // Linear: classify by label
    if (source === 'linear') {
      const feedbackLabels = ['feedback', 'question', 'discussion'];
      if (labels.some((l) => feedbackLabels.some((fl) => l.toLowerCase().includes(fl)))) {
        return 'feedback';
      }
      const ideaLabels = ['idea', 'explore', 'research', 'proposal'];
      if (labels.some((l) => ideaLabels.some((il) => l.toLowerCase().includes(il)))) {
        return 'idea';
      }
      // Default Linear signals are concrete work orders
      return 'work_order';
    }

    // Discord: classify by channel name
    if (source === 'discord') {
      const feedbackChannels = ['feedback', 'questions', 'support'];
      if (feedbackChannels.some((ch) => channelName.includes(ch))) {
        return 'feedback';
      }
      const ideaChannels = ['ideas', 'suggestions', 'brainstorm'];
      if (ideaChannels.some((ch) => channelName.includes(ch))) {
        return 'idea';
      }
      const convChannels = ['general', 'random', 'chat', 'social', 'off-topic'];
      if (convChannels.some((ch) => channelName.includes(ch))) {
        return 'conversational';
      }
      // Default Discord messages in dev/ops channels are work orders
      return 'work_order';
    }

    // UI content creation → idea by default (goes through PM for refinement)
    if (source === 'ui:content') {
      return 'idea';
    }

    // Default: treat as a work order
    return 'work_order';
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
      const classification = await this.classifySignal(signal);

      // Classify signal intent (nature of the request, independent of ops/gtm routing)
      const intent = this.classifySignalIntent(signal);

      logger.info(
        `Processing signal from ${signal.source}: "${title}" (${classification.category} - ${classification.reason}, intent: ${intent})`
      );

      const projectPath = signal.channelContext?.projectPath || this.defaultProjectPath;

      // Interrupt intent: bypass PM pipeline and create a HITL form directly for human triage
      if (intent === 'interrupt') {
        logger.info(`Interrupt signal received: "${title}" — creating HITL form for human triage`);

        let hitlFormId: string | undefined;
        if (this.hitlFormService) {
          const form = this.hitlFormService.create({
            title: `Interrupt: ${title}`,
            description: `An urgent signal was received from ${signal.source} and requires immediate human attention.\n\n${description}`,
            callerType: 'api',
            projectPath,
            steps: [
              {
                title: 'Triage',
                description: 'Review the interrupt signal and decide how to respond.',
                schema: {
                  type: 'object',
                  required: ['action'],
                  properties: {
                    action: {
                      type: 'string',
                      title: 'Action',
                      enum: ['create_feature', 'acknowledge', 'escalate', 'dismiss'],
                      enumNames: [
                        'Create a feature for this',
                        'Acknowledge and monitor',
                        'Escalate to team',
                        'Dismiss (false alarm)',
                      ],
                    },
                    notes: {
                      type: 'string',
                      title: 'Notes',
                      description: 'Optional notes for the team',
                    },
                  },
                },
              },
            ],
          });
          hitlFormId = form.id;
        } else {
          logger.warn(
            'HITLFormService not wired into SignalIntakeService — interrupt signal will not create a form. Call setHITLFormService() during service initialization.'
          );
        }

        this.events.emit('signal:routed', {
          projectPath,
          featureId: undefined,
          title,
          description,
          category: classification.category,
          reason: 'interrupt intent bypasses PM pipeline',
          source: signal.source,
          timestamp: signal.timestamp,
          intent,
          hitlFormId,
        });
        return;
      }

      // GTM signals: route to GTM Authority Agent for content creation
      if (classification.category === 'gtm') {
        logger.info(`GTM signal routed: "${title}" (source: ${signal.source}, intent: ${intent})`);

        // Create feature with idea state before emitting to ensure featureId is available
        const gtmFeature = await this.featureLoader.create(projectPath, {
          title: `[${signal.source}] ${title}`,
          description,
          status: 'backlog',
          category: 'Signal Intake',
          complexity: 'medium',
          workItemState: 'idea',
        });

        this.events.emit('authority:gtm-signal-received', {
          projectPath,
          featureId: gtmFeature.id,
          title,
          description,
          source: signal.source,
          timestamp: signal.timestamp,
        });
        this.events.emit('signal:routed', {
          projectPath,
          featureId: gtmFeature.id,
          title,
          description,
          category: 'gtm',
          reason: classification.reason,
          source: signal.source,
          timestamp: signal.timestamp,
          intent,
        });
        return;
      }

      // Ops signals: route to Lead Engineer state machine
      // Guard: For Linear signals, check if feature already exists
      if (signal.source === 'linear' && signal.channelContext?.issueId) {
        const linearIssueId = signal.channelContext.issueId as string;
        const existing = await this.featureLoader.findByLinearIssueId(projectPath, linearIssueId);
        if (existing) {
          if (existing.status === 'in_progress' || existing.status === 'blocked') {
            // Active feature found — route signal content as a follow-up to the running agent
            logger.info(
              `Routing Linear signal to active feature ${existing.id} (${existing.status}) for issue ${linearIssueId}`
            );
            this.events.emit('linear:comment:followup', {
              featureId: existing.id,
              projectPath,
              commentBody: signal.content,
              userName: signal.author.name,
              issueId: linearIssueId,
            });
          } else {
            logger.info(
              `Feature already exists for Linear issue ${linearIssueId}, skipping creation (feature: ${existing.id})`
            );
          }
          return;
        }
      }

      // Create feature with idea state
      const feature = await this.featureLoader.create(projectPath, {
        title: `[${signal.source}] ${title}`,
        description,
        status: 'backlog',
        category: 'Signal Intake',
        complexity: 'medium',
        workItemState: 'idea',
        // Store Linear issue ID if available
        ...(signal.source === 'linear' && signal.channelContext?.issueId
          ? { linearIssueId: signal.channelContext.issueId as string }
          : {}),
        // Store GitHub issue number for auto-close on PR merge
        ...(signal.source === 'github' && signal.channelContext?.issueNumber
          ? { githubIssueNumber: signal.channelContext.issueNumber as number }
          : {}),
      });

      // Trigger PM Agent pipeline
      this.events.emit('authority:idea-injected', {
        projectPath,
        featureId: feature.id,
        title,
        description,
        injectedBy: `signal:${signal.source}`,
        injectedAt: new Date().toISOString(),
        autoApprove: signal.channelContext?.autoApprove as boolean | undefined,
        webResearch: signal.channelContext?.webResearch as boolean | undefined,
      });

      // Emit routing event for observability
      this.events.emit('signal:routed', {
        projectPath,
        featureId: feature.id,
        title,
        description,
        category: 'ops',
        reason: classification.reason,
        source: signal.source,
        timestamp: signal.timestamp,
        intent,
      });

      logger.info(
        `Ops signal routed to Lead Engineer: "${title}" → feature ${feature.id} (source: ${signal.source}, intent: ${intent})`
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
    webResearch?: boolean;
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
        webResearch: params.webResearch,
      },
      timestamp: new Date().toISOString(),
    };
    this.events.emit('signal:received', signal);
  }
}
