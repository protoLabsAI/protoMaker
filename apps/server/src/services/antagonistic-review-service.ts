/**
 * AntagonisticReviewService - Orchestrates sequential Ava + Jon PRD review
 *
 * Executes a 3-stage review pipeline:
 * 1. Ava reviews for operational feasibility (capacity, risk, technical debt)
 * 2. Jon reviews for market value (customer impact, ROI, positioning) with access to Ava's critique
 * 3. Resolution agent (Ava as CoS) merges verdicts into consolidated PRD
 *
 * Must complete in < 3 minutes.
 */

import { createLogger } from '@automaker/utils';
import type { EventEmitter } from '../lib/events.js';
import type { AgentFactoryService } from './agent-factory-service.js';
import { DynamicAgentExecutor } from './dynamic-agent-executor.js';
import type { SPARCPrd } from '@automaker/types';
import { AntagonisticReviewAdapter } from './antagonistic-review-adapter.js';
import { getLangfuseInstance } from '../lib/langfuse-singleton.js';
import type { SettingsService } from './settings-service.js';

const logger = createLogger('AntagonisticReview');

const REVIEW_TIMEOUT_MS = 180_000; // 3 minutes

/**
 * Review result from a single agent
 */
export interface ReviewResult {
  success: boolean;
  reviewer: string;
  verdict: string;
  concerns?: string[];
  recommendations?: string[];
  durationMs: number;
  error?: string;
}

/**
 * Consolidated review output
 */
export interface ConsolidatedReview {
  success: boolean;
  avaReview: ReviewResult;
  jonReview: ReviewResult;
  resolution: string;
  finalPRD?: SPARCPrd;
  totalDurationMs: number;
  error?: string;
}

/**
 * Review request parameters
 */
export interface ReviewRequest {
  prd: SPARCPrd;
  prdId: string;
  projectPath: string;
}

export class AntagonisticReviewService {
  private static instance: AntagonisticReviewService;
  private agentFactory: AgentFactoryService;
  private executor: DynamicAgentExecutor;
  private events: EventEmitter;
  private settingsService: SettingsService;
  private adapter: AntagonisticReviewAdapter | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(
    agentFactory: AgentFactoryService,
    events: EventEmitter,
    settingsService: SettingsService
  ) {
    this.agentFactory = agentFactory;
    this.events = events;
    this.settingsService = settingsService;
    this.executor = new DynamicAgentExecutor(events);
  }

  /**
   * Ensure Langfuse is initialized before use (lazy, once)
   */
  private ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initializeLangfuse();
    }
    return this.initPromise;
  }

  /**
   * Initialize Langfuse client and adapter
   */
  private async initializeLangfuse(): Promise<void> {
    try {
      const langfuseClient = getLangfuseInstance();

      if (langfuseClient.isAvailable()) {
        this.adapter = new AntagonisticReviewAdapter({
          smartModel: 'claude-3-5-sonnet-20241022',
          enableHITL: false,
          langfuseClient,
        });

        logger.info('Langfuse tracing initialized for antagonistic reviews');
      } else {
        logger.info('Langfuse not available, tracing disabled for antagonistic reviews');
      }
    } catch (error) {
      logger.error('Failed to initialize Langfuse:', error);
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(
    agentFactory: AgentFactoryService,
    events: EventEmitter,
    settingsService: SettingsService
  ): AntagonisticReviewService {
    if (!AntagonisticReviewService.instance) {
      AntagonisticReviewService.instance = new AntagonisticReviewService(
        agentFactory,
        events,
        settingsService
      );
    }
    return AntagonisticReviewService.instance;
  }

  /**
   * Execute the full antagonistic review pipeline
   */
  async executeReview(request: ReviewRequest): Promise<ConsolidatedReview> {
    // Ensure Langfuse is initialized before checking adapter availability
    await this.ensureInitialized();

    const startTime = Date.now();
    const { prd, prdId, projectPath } = request;

    logger.info(`Starting antagonistic review for PRD: ${prdId}`);

    // Emit review started event
    this.events.emit('prd:review:started', {
      prdId,
      projectPath,
      timestamp: new Date().toISOString(),
    });

    // Check if useGraphFlows feature flag is enabled
    const settings = await this.settingsService.getGlobalSettings();
    const useGraphFlows = settings.useGraphFlows ?? true; // Default to true

    // If feature flag is enabled and adapter is available, use the new flow
    if (useGraphFlows && this.adapter) {
      logger.info('Using LangGraph flow for antagonistic review');
      const result = await this.adapter.executeReview(request);

      // Emit review completed event for backward compatibility
      this.events.emit('prd:review:completed', {
        prdId,
        projectPath,
        totalDurationMs: result.totalDurationMs,
        totalCost: result.totalCost,
        traceId: result.traceId,
        success: result.success,
        error: result.error,
        timestamp: new Date().toISOString(),
      });

      return result;
    }

    // Otherwise, fall back to legacy DynamicAgentExecutor implementation
    logger.info('Using legacy DynamicAgentExecutor for antagonistic review');

    try {
      // Create abort controller for timeout
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        abortController.abort();
        logger.warn(`Review timeout after ${REVIEW_TIMEOUT_MS}ms for PRD ${prdId}`);
      }, REVIEW_TIMEOUT_MS);

      try {
        // Stage 1: Ava reviews for operational feasibility
        const avaReview = await this.executeAvaReview(prd, projectPath, abortController);

        if (!avaReview.success) {
          throw new Error(`Ava review failed: ${avaReview.error}`);
        }

        // Stage 2: Jon reviews for market value (with access to Ava's critique)
        const jonReview = await this.executeJonReview(prd, avaReview, projectPath, abortController);

        if (!jonReview.success) {
          throw new Error(`Jon review failed: ${jonReview.error}`);
        }

        // Stage 3: Resolution - Ava as CoS merges verdicts
        const resolution = await this.executeResolution(
          prd,
          avaReview,
          jonReview,
          projectPath,
          abortController
        );

        const totalDurationMs = Date.now() - startTime;

        logger.info(`Antagonistic review completed in ${totalDurationMs}ms for PRD ${prdId}`);

        // Emit review completed event
        this.events.emit('prd:review:completed', {
          prdId,
          projectPath,
          totalDurationMs,
          success: true,
          timestamp: new Date().toISOString(),
        });

        return {
          success: true,
          avaReview,
          jonReview,
          resolution: resolution.output,
          finalPRD: this.extractPRDFromResolution(resolution.output),
          totalDurationMs,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      const totalDurationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(`Antagonistic review failed for PRD ${prdId}: ${errorMessage}`);

      // Emit review completed event with error
      this.events.emit('prd:review:completed', {
        prdId,
        projectPath,
        totalDurationMs,
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });

      return {
        success: false,
        avaReview: {
          success: false,
          reviewer: 'ava',
          verdict: '',
          durationMs: 0,
          error: errorMessage,
        },
        jonReview: {
          success: false,
          reviewer: 'jon',
          verdict: '',
          durationMs: 0,
          error: errorMessage,
        },
        resolution: '',
        totalDurationMs,
        error: errorMessage,
      };
    }
  }

  /**
   * Stage 1: Ava reviews for operational feasibility
   */
  private async executeAvaReview(
    prd: SPARCPrd,
    projectPath: string,
    abortController: AbortController
  ): Promise<ReviewResult> {
    const startTime = Date.now();

    logger.info('Stage 1: Ava reviewing for operational feasibility');

    try {
      // Create Ava agent config (assuming 'ava' or 'cos' template exists)
      const avaConfig = this.agentFactory.createFromTemplate('ava', projectPath);

      const prompt = this.buildAvaPrompt(prd);

      const result = await this.executor.execute(avaConfig, {
        prompt,
        abortController,
      });

      const durationMs = Date.now() - startTime;

      if (!result.success) {
        return {
          success: false,
          reviewer: 'ava',
          verdict: '',
          durationMs,
          error: result.error,
        };
      }

      // Parse Ava's output to extract concerns and recommendations
      const { concerns, recommendations } = this.parseReviewOutput(result.output);

      return {
        success: true,
        reviewer: 'ava',
        verdict: result.output,
        concerns,
        recommendations,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(`Ava review failed: ${errorMessage}`);

      return {
        success: false,
        reviewer: 'ava',
        verdict: '',
        durationMs,
        error: errorMessage,
      };
    }
  }

  /**
   * Stage 2: Jon reviews for market value
   */
  private async executeJonReview(
    prd: SPARCPrd,
    avaReview: ReviewResult,
    projectPath: string,
    abortController: AbortController
  ): Promise<ReviewResult> {
    const startTime = Date.now();

    logger.info('Stage 2: Jon reviewing for market value');

    try {
      // Create Jon agent config (assuming 'jon' or 'ceo' template exists)
      const jonConfig = this.agentFactory.createFromTemplate('jon', projectPath);

      const prompt = this.buildJonPrompt(prd, avaReview);

      const result = await this.executor.execute(jonConfig, {
        prompt,
        abortController,
      });

      const durationMs = Date.now() - startTime;

      if (!result.success) {
        return {
          success: false,
          reviewer: 'jon',
          verdict: '',
          durationMs,
          error: result.error,
        };
      }

      // Parse Jon's output to extract concerns and recommendations
      const { concerns, recommendations } = this.parseReviewOutput(result.output);

      return {
        success: true,
        reviewer: 'jon',
        verdict: result.output,
        concerns,
        recommendations,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(`Jon review failed: ${errorMessage}`);

      return {
        success: false,
        reviewer: 'jon',
        verdict: '',
        durationMs,
        error: errorMessage,
      };
    }
  }

  /**
   * Stage 3: Resolution - Ava as CoS merges verdicts
   */
  private async executeResolution(
    prd: SPARCPrd,
    avaReview: ReviewResult,
    jonReview: ReviewResult,
    projectPath: string,
    abortController: AbortController
  ): Promise<{ success: boolean; output: string; error?: string }> {
    logger.info('Stage 3: Resolution - merging verdicts into consolidated PRD');

    try {
      // Use Ava again but in CoS resolution mode
      const resolutionConfig = this.agentFactory.createFromTemplate('ava', projectPath);

      const prompt = this.buildResolutionPrompt(prd, avaReview, jonReview);

      const result = await this.executor.execute(resolutionConfig, {
        prompt,
        abortController,
      });

      return {
        success: result.success,
        output: result.output,
        error: result.error,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(`Resolution failed: ${errorMessage}`);

      return {
        success: false,
        output: '',
        error: errorMessage,
      };
    }
  }

  /**
   * Build Ava's review prompt focusing on operational feasibility
   */
  private buildAvaPrompt(prd: SPARCPrd): string {
    return `You are Ava, the Chief of Staff. Review this PRD for operational feasibility.

**PRD to Review:**

**Situation:** ${prd.situation}

**Problem:** ${prd.problem}

**Approach:** ${prd.approach}

**Results:** ${prd.results}

**Constraints:** ${prd.constraints || 'None specified'}

---

**Your Task:**

Review this PRD from an operational perspective. Assess:

1. **Capacity**: Do we have the resources, time, and team capacity to execute this?
2. **Risk**: What technical, operational, or execution risks exist?
3. **Technical Debt**: Will this create technical debt or maintenance burden?
4. **Feasibility**: Is the approach technically sound and achievable?

**Output Format:**

Provide your review as structured text with:

## Operational Assessment

[Your overall assessment]

## Concerns

- [List specific concerns, if any]

## Recommendations

- [List recommendations for improvement]

## Verdict

[APPROVE / APPROVE_WITH_CONDITIONS / REJECT]

Be candid and thorough. Your role is to ensure we don't commit to something we cannot deliver.`;
  }

  /**
   * Build Jon's review prompt focusing on market value
   */
  private buildJonPrompt(prd: SPARCPrd, avaReview: ReviewResult): string {
    return `You are Jon, the CEO. Review this PRD for market value and strategic fit.

**PRD to Review:**

**Situation:** ${prd.situation}

**Problem:** ${prd.problem}

**Approach:** ${prd.approach}

**Results:** ${prd.results}

**Constraints:** ${prd.constraints || 'None specified'}

---

**Ava's Operational Review:**

${avaReview.verdict}

---

**Your Task:**

Review this PRD from a market and strategic perspective. You have seen Ava's operational concerns. Now assess:

1. **Customer Impact**: How does this benefit our customers? What's the value proposition?
2. **ROI**: What's the expected return on investment? Is this worth the effort?
3. **Positioning**: Does this align with our strategic direction and market positioning?
4. **Priority**: How does this compare to other opportunities?

**Output Format:**

Provide your review as structured text with:

## Market Assessment

[Your overall assessment]

## Concerns

- [List specific concerns, if any]

## Recommendations

- [List recommendations for improvement]

## Verdict

[APPROVE / APPROVE_WITH_CONDITIONS / REJECT]

Consider Ava's operational concerns but focus on the market and strategic value. Be honest about whether this is worth pursuing.`;
  }

  /**
   * Build resolution prompt for Ava to merge verdicts
   */
  private buildResolutionPrompt(
    prd: SPARCPrd,
    avaReview: ReviewResult,
    jonReview: ReviewResult
  ): string {
    return `You are Ava, the Chief of Staff. Synthesize the reviews into a consolidated PRD.

**Original PRD:**

**Situation:** ${prd.situation}

**Problem:** ${prd.problem}

**Approach:** ${prd.approach}

**Results:** ${prd.results}

**Constraints:** ${prd.constraints || 'None specified'}

---

**Your Operational Review:**

${avaReview.verdict}

---

**Jon's Market Review:**

${jonReview.verdict}

---

**Your Task:**

As Chief of Staff, merge both perspectives into a consolidated PRD. Incorporate:

- Operational feasibility concerns and recommendations
- Market value and strategic considerations
- Any required adjustments to approach or constraints
- Final decision on whether to proceed

**Output Format:**

Provide the consolidated PRD in SPARC format:

## Consolidated PRD

### Situation
[Updated situation context]

### Problem
[Updated problem statement]

### Approach
[Updated approach incorporating feedback]

### Results
[Updated expected results]

### Constraints
[Updated constraints]

### Final Decision

[PROCEED / PROCEED_WITH_MODIFICATIONS / REJECT]

### Rationale

[Explanation of the final decision considering both reviews]

Be clear, concise, and actionable. This is the final PRD that will guide implementation.`;
  }

  /**
   * Parse review output to extract concerns and recommendations
   */
  private parseReviewOutput(output: string): {
    concerns?: string[];
    recommendations?: string[];
  } {
    const concerns: string[] = [];
    const recommendations: string[] = [];

    // Simple parsing: look for "## Concerns" and "## Recommendations" sections
    const concernsMatch = output.match(/## Concerns\s+([\s\S]*?)(?=##|$)/);
    const recsMatch = output.match(/## Recommendations\s+([\s\S]*?)(?=##|$)/);

    if (concernsMatch) {
      const items = concernsMatch[1]
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('-') || line.startsWith('*'))
        .map((line) => line.replace(/^[-*]\s*/, '').trim())
        .filter((line) => line.length > 0);
      concerns.push(...items);
    }

    if (recsMatch) {
      const items = recsMatch[1]
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('-') || line.startsWith('*'))
        .map((line) => line.replace(/^[-*]\s*/, '').trim())
        .filter((line) => line.length > 0);
      recommendations.push(...items);
    }

    return {
      concerns: concerns.length > 0 ? concerns : undefined,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
    };
  }

  /**
   * Extract PRD from resolution output
   */
  private extractPRDFromResolution(resolution: string): SPARCPrd | undefined {
    try {
      // Parse SPARC sections from the resolution
      const situationMatch = resolution.match(/### Situation\s+([\s\S]*?)(?=###|$)/);
      const problemMatch = resolution.match(/### Problem\s+([\s\S]*?)(?=###|$)/);
      const approachMatch = resolution.match(/### Approach\s+([\s\S]*?)(?=###|$)/);
      const resultsMatch = resolution.match(/### Results\s+([\s\S]*?)(?=###|$)/);
      const constraintsMatch = resolution.match(/### Constraints\s+([\s\S]*?)(?=###|$)/);

      if (!situationMatch || !problemMatch || !approachMatch || !resultsMatch) {
        logger.warn('Could not extract complete PRD from resolution');
        return undefined;
      }

      return {
        situation: situationMatch[1].trim(),
        problem: problemMatch[1].trim(),
        approach: approachMatch[1].trim(),
        results: resultsMatch[1].trim(),
        constraints: constraintsMatch ? constraintsMatch[1].trim() : '',
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to extract PRD from resolution:', error);
      return undefined;
    }
  }
}
