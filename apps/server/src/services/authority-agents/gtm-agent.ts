/**
 * GTM Authority Agent — Go-To-Market Content Creation
 *
 * Listens for `authority:gtm-signal-received` events and orchestrates
 * a two-step content creation pipeline:
 *   1. Jon (sonnet, 1-turn): Research + strategy brief
 *   2. Cindi (sonnet, 1-turn): Rough draft from Jon's brief
 *
 * Supports two execution paths:
 *   - **Full LangGraph flow**: Uses ContentFlowService's 21-node pipeline (when available)
 *   - **SimpleQuery fallback**: Direct Jon + Cindi simpleQuery calls
 *
 * On success, emits `content:draft-ready` so the UI can open the
 * ContentReviewDialog for user approval.
 *
 * Drafts are stored in-memory for persistence across page refreshes.
 * Supports `content:changes-requested` for feedback-driven re-drafting.
 *
 * Mirrors the PM Agent pattern for event handling and processing guards.
 */

import type { PipelinePhase } from '@automaker/types';
import { createLogger } from '@automaker/utils';
import { resolveModelString } from '@automaker/model-resolver';
import { randomUUID } from 'node:crypto';
import type { EventEmitter } from '../../lib/events.js';
import type { AuthorityService } from '../authority-service.js';
import type { FeatureLoader } from '../feature-loader.js';
import type { AuditService } from '../audit-service.js';
import type { SettingsService } from '../settings-service.js';
import type { ContentFlowService } from '../content-flow-service.js';
import type { HITLFormService } from '../hitl-form-service.js';
import { simpleQuery } from '../../providers/simple-query-service.js';
import {
  createAgentState,
  initializeAgent,
  withProcessingGuard,
  type AgentState,
} from './agent-utils.js';

const logger = createLogger('GTMAgent');

const GTM_MODEL = resolveModelString('sonnet');

interface GTMSignalPayload {
  projectPath: string;
  title: string;
  description: string;
  source: string;
  timestamp: string;
}

interface StrategyBrief {
  angle: string;
  audience: string;
  keyPoints: string[];
  tone: string;
  suggestedTitle: string;
}

export interface ContentDraft {
  contentId: string;
  title: string;
  draft: string;
  strategy: StrategyBrief;
  source: string;
  projectPath: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  version: number;
}

export class GTMAuthorityAgent {
  private readonly events: EventEmitter;
  private readonly authorityService: AuthorityService;
  private readonly featureLoader: FeatureLoader;
  private readonly auditService: AuditService | null;
  private readonly settingsService: SettingsService | null;
  private readonly contentFlowService: ContentFlowService | null;
  private readonly hitlFormService: HITLFormService | null;
  private readonly state: AgentState;
  private listenerRegistered = false;
  private readonly pendingDrafts: Map<string, ContentDraft> = new Map();

  constructor(
    events: EventEmitter,
    authorityService: AuthorityService,
    featureLoader: FeatureLoader,
    auditService?: AuditService,
    settingsService?: SettingsService,
    contentFlowService?: ContentFlowService,
    hitlFormService?: HITLFormService
  ) {
    this.events = events;
    this.authorityService = authorityService;
    this.featureLoader = featureLoader;
    this.auditService = auditService || null;
    this.settingsService = settingsService || null;
    this.contentFlowService = contentFlowService || null;
    this.hitlFormService = hitlFormService || null;
    this.state = createAgentState();

    this.registerEventListener();
  }

  // ── Public API ──────────────────────────────────────────────────

  getPendingDraftCount(): number {
    return Array.from(this.pendingDrafts.values()).filter((d) => d.status === 'pending').length;
  }

  getPendingDrafts(): ContentDraft[] {
    return Array.from(this.pendingDrafts.values()).filter((d) => d.status === 'pending');
  }

  // ── Event Listeners ─────────────────────────────────────────────

  private registerEventListener(): void {
    if (this.listenerRegistered) return;
    this.listenerRegistered = true;

    this.events.subscribe((type, payload) => {
      if (type === 'authority:gtm-signal-received') {
        const signal = payload as GTMSignalPayload;

        if (!this.state.isInitialized(signal.projectPath)) {
          void (async () => {
            try {
              await this.initialize(signal.projectPath);
              void this.processContentSignal(signal);
            } catch (error) {
              logger.error(
                `[GTMAgent] Auto-initialization failed for ${signal.projectPath}:`,
                error
              );
            }
          })();
        } else {
          void this.processContentSignal(signal);
        }
      }

      // Remove draft from pending on approve/reject
      if (type === 'content:draft-approved' || type === 'content:draft-rejected') {
        const { contentId } = payload as { contentId: string };
        const draft = this.pendingDrafts.get(contentId);
        if (draft) {
          draft.status = type === 'content:draft-approved' ? 'approved' : 'rejected';
        }
      }

      // Re-process draft on changes requested
      if (type === 'content:changes-requested') {
        const { contentId, feedback } = payload as { contentId: string; feedback: string };
        void this.reprocessDraft(contentId, feedback);
      }
    });
  }

  async initialize(projectPath: string): Promise<void> {
    await initializeAgent(this.state, this.authorityService, 'gtm-authority', projectPath);
  }

  // ── Signal Processing ───────────────────────────────────────────

  private async processContentSignal(signal: GTMSignalPayload): Promise<void> {
    const guardKey = `gtm:${signal.title}:${signal.timestamp}`;

    return withProcessingGuard(this.state, guardKey, async () => {
      const { title, source } = signal;

      logger.info(`Processing GTM signal: "${title}" (source: ${source})`);

      // Try full LangGraph flow first, fall back to simpleQuery
      if (this.contentFlowService) {
        try {
          await this.processContentSignalViaFlow(signal);
          return;
        } catch (error) {
          logger.warn(`ContentFlowService failed, falling back to simpleQuery:`, error);
        }
      }

      await this.processContentSignalViaSimpleQuery(signal);
    });
  }

  private async processContentSignalViaFlow(signal: GTMSignalPayload): Promise<void> {
    const { projectPath, title, description, source } = signal;

    logger.info(`Starting content flow for: "${title}"`);

    const { runId } = await this.contentFlowService!.startFlow(
      projectPath,
      `${title}: ${description}`,
      {
        format: 'guide',
        tone: 'conversational',
        audience: 'intermediate',
        outputFormats: ['markdown'],
        enableHITL: false,
      }
    );

    // Store a tracking entry — the flow will complete asynchronously
    const contentId = randomUUID();
    const draft: ContentDraft = {
      contentId,
      title,
      draft: '', // Will be populated when flow completes
      strategy: {
        angle: 'Generated by content pipeline',
        audience: 'intermediate',
        keyPoints: [],
        tone: 'conversational',
        suggestedTitle: title,
      },
      source,
      projectPath,
      status: 'pending',
      createdAt: new Date().toISOString(),
      version: 1,
    };

    this.pendingDrafts.set(contentId, draft);

    logger.info(`Content flow ${runId} started, tracking as ${contentId}`);
  }

  private async processContentSignalViaSimpleQuery(signal: GTMSignalPayload): Promise<void> {
    const { projectPath, title, description, source } = signal;

    // Step 1: Jon — strategy brief
    this.events.emit('authority:gtm-research-started', {
      projectPath,
      title,
      source,
      timestamp: new Date().toISOString(),
    });

    let strategy: StrategyBrief;
    try {
      strategy = await this.runJon(title, description, projectPath);
    } catch (error) {
      logger.error(`Jon strategy call failed for "${title}":`, error);
      return;
    }

    // Step 2: Cindi — rough draft
    this.events.emit('authority:gtm-draft-started', {
      projectPath,
      title,
      source,
      timestamp: new Date().toISOString(),
    });

    let draft: string;
    try {
      draft = await this.runCindi(strategy, description, projectPath);
    } catch (error) {
      logger.error(`Cindi draft call failed for "${title}":`, error);
      return;
    }

    // Store and emit
    const contentId = randomUUID();
    this.storeDraftAndEmit(
      contentId,
      strategy.suggestedTitle || title,
      draft,
      strategy,
      source,
      projectPath
    );
  }

  // ── Re-processing (request changes) ────────────────────────────

  private async reprocessDraft(contentId: string, feedback: string): Promise<void> {
    const original = this.pendingDrafts.get(contentId);
    if (!original) {
      logger.warn(`Cannot reprocess: draft ${contentId} not found`);
      return;
    }

    logger.info(`Reprocessing draft "${original.title}" with feedback`);

    const { projectPath, strategy } = original;

    // Re-run Cindi with feedback appended
    let draft: string;
    try {
      draft = await this.runCindiWithFeedback(strategy, original.draft, feedback, projectPath);
    } catch (error) {
      logger.error(`Cindi reprocessing failed for "${original.title}":`, error);
      return;
    }

    // Update the existing draft entry
    original.draft = draft;
    original.version += 1;
    original.status = 'pending';

    // Emit updated draft
    this.events.emit('content:draft-ready', {
      projectPath,
      contentId,
      title: original.title,
      draft,
      strategy,
      source: original.source,
      version: original.version,
      timestamp: new Date().toISOString(),
    });

    logger.info(`Updated draft ready: "${original.title}" v${original.version} (${contentId})`);
  }

  // ── Draft Storage ───────────────────────────────────────────────

  private storeDraftAndEmit(
    contentId: string,
    title: string,
    draft: string,
    strategy: StrategyBrief,
    source: string,
    projectPath: string
  ): void {
    this.pendingDrafts.set(contentId, {
      contentId,
      title,
      draft,
      strategy,
      source,
      projectPath,
      status: 'pending',
      createdAt: new Date().toISOString(),
      version: 1,
    });

    this.events.emit('content:draft-ready', {
      projectPath,
      contentId,
      title,
      draft,
      strategy,
      source,
      timestamp: new Date().toISOString(),
    });

    logger.info(`Content draft ready: "${title}" (${contentId})`);
  }

  // ── Jon: GTM Strategist ─────────────────────────────────────────

  private async runJon(
    title: string,
    description: string,
    projectPath: string
  ): Promise<StrategyBrief> {
    const systemPrompt = `You are Jon, GTM strategist for protoLabs Studio. Analyze this content idea and produce a strategy brief.

You MUST respond with valid JSON matching this schema:
{
  "angle": "The unique angle or hook for this content",
  "audience": "Target audience description",
  "keyPoints": ["Key point 1", "Key point 2", "Key point 3"],
  "tone": "Recommended tone (e.g., technical, conversational, authoritative)",
  "suggestedTitle": "A compelling title for the content"
}

Be strategic and specific. Consider SEO, audience engagement, and brand positioning for an AI development studio.`;

    const prompt = `Create a strategy brief for this content idea:

**Title:** ${title}

**Description:**
${description}`;

    const result = await simpleQuery({
      prompt,
      systemPrompt,
      model: GTM_MODEL,
      cwd: projectPath,
      maxTurns: 1,
      allowedTools: [],
    });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Jon did not return valid JSON');
    }

    const parsed = JSON.parse(jsonMatch[0]) as StrategyBrief;
    if (!parsed.angle || !parsed.audience || !parsed.suggestedTitle) {
      throw new Error('Jon strategy brief missing required fields');
    }

    return {
      angle: parsed.angle,
      audience: parsed.audience,
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
      tone: parsed.tone || 'conversational',
      suggestedTitle: parsed.suggestedTitle,
    };
  }

  // ── Cindi: Content Writer ───────────────────────────────────────

  private async runCindi(
    strategy: StrategyBrief,
    originalDescription: string,
    projectPath: string
  ): Promise<string> {
    const systemPrompt = `You are Cindi, content writer for protoLabs Studio. Write a rough draft blog post in markdown based on the strategy brief provided.

Guidelines:
- Include a compelling title as an H1
- Use clear section headings (H2/H3)
- Cover all key points from the strategy brief
- Match the recommended tone
- Write for the specified audience
- This is a first draft for human review — aim for substance over polish
- Include a brief intro and conclusion
- Target 800-1200 words`;

    const prompt = `Write a rough draft based on this strategy brief:

**Strategy Brief:**
- Angle: ${strategy.angle}
- Audience: ${strategy.audience}
- Key Points: ${strategy.keyPoints.join(', ')}
- Tone: ${strategy.tone}
- Suggested Title: ${strategy.suggestedTitle}

**Original Idea:**
${originalDescription}`;

    const result = await simpleQuery({
      prompt,
      systemPrompt,
      model: GTM_MODEL,
      cwd: projectPath,
      maxTurns: 1,
      allowedTools: [],
    });

    if (!result.text || result.text.length < 100) {
      throw new Error('Cindi returned insufficient draft content');
    }

    return result.text;
  }

  /**
   * Re-run Cindi with feedback from reviewer appended to the prompt.
   */
  private async runCindiWithFeedback(
    strategy: StrategyBrief,
    previousDraft: string,
    feedback: string,
    projectPath: string
  ): Promise<string> {
    const systemPrompt = `You are Cindi, content writer for protoLabs Studio. You are revising a blog post draft based on reviewer feedback.

Guidelines:
- Address ALL feedback points specifically
- Maintain the original strategy brief direction
- Keep the same tone and audience targeting
- This is a revised draft for human review
- Target 800-1200 words`;

    const prompt = `Revise this draft based on the reviewer's feedback:

**Strategy Brief:**
- Angle: ${strategy.angle}
- Audience: ${strategy.audience}
- Key Points: ${strategy.keyPoints.join(', ')}
- Tone: ${strategy.tone}
- Suggested Title: ${strategy.suggestedTitle}

**Previous Draft:**
${previousDraft}

**Reviewer Feedback:**
${feedback}

Please produce a revised draft that addresses all the feedback.`;

    const result = await simpleQuery({
      prompt,
      systemPrompt,
      model: GTM_MODEL,
      cwd: projectPath,
      maxTurns: 1,
      allowedTools: [],
    });

    if (!result.text || result.text.length < 100) {
      throw new Error('Cindi returned insufficient revised draft content');
    }

    return result.text;
  }

  /**
   * PhaseProcessor implementation — orchestrator calls this during active dispatch.
   */
  async executePhase(projectPath: string, featureId: string, phase: PipelinePhase): Promise<void> {
    switch (phase) {
      case 'RESEARCH': {
        const feature = await this.featureLoader.get(projectPath, featureId);
        if (!feature) {
          logger.warn(`[Pipeline] GTM RESEARCH: feature not found (${featureId})`);
          return;
        }
        this.events.emit('authority:gtm-signal-received', {
          projectPath,
          title: feature.title ?? 'Untitled',
          description: feature.description ?? '',
          source: 'pipeline',
          timestamp: new Date().toISOString(),
        });
        break;
      }
      case 'SPEC':
        // Cindi draft is triggered by research completion (existing flow)
        logger.info(`[Pipeline] GTM SPEC phase for ${featureId} — draft gen follows research`);
        break;
      case 'SPEC_REVIEW':
        logger.info(`[Pipeline] GTM SPEC_REVIEW for ${featureId} — awaiting user review`);
        break;
      case 'EXECUTE':
        // Content flow execution (LangGraph 21-node pipeline)
        logger.info(`[Pipeline] GTM EXECUTE for ${featureId} — content flow handles this`);
        break;
      default:
        logger.warn(`[Pipeline] GTM agent has no handler for phase ${phase}`);
    }
  }
}
