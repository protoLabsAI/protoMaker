/**
 * GTM Authority Agent — Go-To-Market Content Creation
 *
 * Listens for `authority:gtm-signal-received` events and orchestrates
 * a two-step content creation pipeline:
 *   1. Jon (sonnet, 1-turn): Research + strategy brief
 *   2. Cindi (sonnet, 1-turn): Rough draft from Jon's brief
 *
 * On success, emits `content:draft-ready` so the UI can open the
 * ContentReviewDialog for user approval.
 *
 * Mirrors the PM Agent pattern for event handling and processing guards.
 */

import { createLogger } from '@automaker/utils';
import { resolveModelString } from '@automaker/model-resolver';
import { randomUUID } from 'node:crypto';
import type { EventEmitter } from '../../lib/events.js';
import type { AuthorityService } from '../authority-service.js';
import type { FeatureLoader } from '../feature-loader.js';
import type { AuditService } from '../audit-service.js';
import type { SettingsService } from '../settings-service.js';
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

export class GTMAuthorityAgent {
  private readonly events: EventEmitter;
  private readonly authorityService: AuthorityService;
  private readonly featureLoader: FeatureLoader;
  private readonly auditService: AuditService | null;
  private readonly settingsService: SettingsService | null;
  private readonly state: AgentState;
  private listenerRegistered = false;

  constructor(
    events: EventEmitter,
    authorityService: AuthorityService,
    featureLoader: FeatureLoader,
    auditService?: AuditService,
    settingsService?: SettingsService
  ) {
    this.events = events;
    this.authorityService = authorityService;
    this.featureLoader = featureLoader;
    this.auditService = auditService || null;
    this.settingsService = settingsService || null;
    this.state = createAgentState();

    this.registerEventListener();
  }

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
    });
  }

  async initialize(projectPath: string): Promise<void> {
    await initializeAgent(this.state, this.authorityService, 'gtm-authority', projectPath);
  }

  private async processContentSignal(signal: GTMSignalPayload): Promise<void> {
    const guardKey = `gtm:${signal.title}:${signal.timestamp}`;

    return withProcessingGuard(this.state, guardKey, async () => {
      const { projectPath, title, description, source } = signal;

      logger.info(`Processing GTM signal: "${title}" (source: ${source})`);

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

      // Emit draft ready for UI review
      const contentId = randomUUID();
      this.events.emit('content:draft-ready', {
        projectPath,
        contentId,
        title: strategy.suggestedTitle || title,
        draft,
        strategy,
        source,
        timestamp: new Date().toISOString(),
      });

      logger.info(`Content draft ready: "${strategy.suggestedTitle || title}" (${contentId})`);
    });
  }

  /**
   * Jon: GTM strategist — produces a strategy brief as JSON.
   */
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

  /**
   * Cindi: Content writer — produces a rough markdown draft from Jon's strategy brief.
   */
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
}
