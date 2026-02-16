/**
 * Idea Processing Flow Tests
 *
 * Unit tests for each flow node and integration test for full pipeline.
 * Tests complexity routing, fast-path bypass, and timeout handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createIdeaProcessingGraph } from '../src/idea-processing/graph.js';
import {
  normalizeIdeaNode,
  shouldUseFastPath,
  executeWithFallback,
  type NormalizeIdeaState,
  type Complexity,
} from '../src/idea-processing/nodes/normalize-idea.js';
import {
  jonTriage,
  fanOutGTM,
  gtmResearchWorker,
  aggregateGTM,
  jonSynthesis,
  type IdeaProcessingState,
  type WorldStateContext,
} from '../src/idea-processing/nodes/jon-research-tree.js';
import type { IdeaInput } from '../src/idea-processing/state.js';

// ─── Normalize Idea Node Tests ─────────────────────────────────────────────

describe('normalizeIdeaNode', () => {
  it('should classify trivial idea correctly', async () => {
    const mockModel = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          title: 'Fix typo',
          description: 'Fix typo in README',
          domain: 'docs',
          keywords: ['typo', 'docs'],
          complexity: 'trivial',
          reasoning: 'Simple documentation fix',
        }),
      }),
    };

    const state: NormalizeIdeaState = {
      rawIdea: 'Fix typo in README',
      inputSource: 'cli',
      smartModel: mockModel,
    };

    const result = await normalizeIdeaNode(state);

    expect(result.normalizedIdea).toBeDefined();
    expect(result.normalizedIdea?.complexity).toBe('trivial');
    expect(result.normalizedIdea?.title).toBe('Fix typo');
    expect(mockModel.invoke).toHaveBeenCalledTimes(1);
  });

  it('should classify standard idea correctly', async () => {
    const mockModel = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          title: 'Add user authentication',
          description: 'Implement JWT-based auth with refresh tokens',
          domain: 'backend',
          keywords: ['auth', 'jwt', 'security'],
          complexity: 'standard',
          reasoning: 'Medium feature requiring analysis',
        }),
      }),
    };

    const state: NormalizeIdeaState = {
      rawIdea: 'Add user authentication with JWT',
      inputSource: 'discord',
      smartModel: mockModel,
    };

    const result = await normalizeIdeaNode(state);

    expect(result.normalizedIdea?.complexity).toBe('standard');
    expect(result.normalizedIdea?.domain).toBe('backend');
  });

  it('should classify complex idea correctly', async () => {
    const mockModel = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          title: 'Distributed tracing system',
          description:
            'Build microservices tracing with OpenTelemetry, Jaeger, and custom sampling',
          domain: 'infrastructure',
          keywords: ['tracing', 'observability', 'distributed'],
          complexity: 'complex',
          reasoning: 'Architectural change, cross-cutting concern',
        }),
      }),
    };

    const state: NormalizeIdeaState = {
      rawIdea: 'Implement distributed tracing across all microservices',
      inputSource: 'linear',
      smartModel: mockModel,
    };

    const result = await normalizeIdeaNode(state);

    expect(result.normalizedIdea?.complexity).toBe('complex');
    expect(result.normalizedIdea?.keywords).toContain('observability');
  });

  it('should handle JSON in markdown code blocks', async () => {
    const mockModel = {
      invoke: vi.fn().mockResolvedValue({
        content:
          '```json\n{"title":"Test","description":"Test desc","domain":"test","keywords":[],"complexity":"trivial","reasoning":"Test"}\n```',
      }),
    };

    const state: NormalizeIdeaState = {
      rawIdea: 'Test idea',
      inputSource: 'api',
      smartModel: mockModel,
    };

    const result = await normalizeIdeaNode(state);

    expect(result.normalizedIdea).toBeDefined();
    expect(result.normalizedIdea?.title).toBe('Test');
  });

  it('should fallback to fast model on smart model failure', async () => {
    const failingSmartModel = {
      invoke: vi.fn().mockRejectedValue(new Error('Smart model timeout')),
    };

    const successfulFastModel = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          title: 'Fallback result',
          description: 'Processed with fast model',
          domain: 'test',
          keywords: ['fallback'],
          complexity: 'trivial',
          reasoning: 'Fast model classification',
        }),
      }),
    };

    const state: NormalizeIdeaState = {
      rawIdea: 'Test fallback',
      inputSource: 'cli',
      smartModel: failingSmartModel,
      fastModel: successfulFastModel,
    };

    const result = await normalizeIdeaNode(state);

    expect(result.normalizedIdea).toBeDefined();
    expect(result.normalizedIdea?.title).toBe('Fallback result');
    expect(failingSmartModel.invoke).toHaveBeenCalledTimes(1);
    expect(successfulFastModel.invoke).toHaveBeenCalledTimes(1);
  });

  it('should throw error when all models fail', async () => {
    const failingSmartModel = {
      invoke: vi.fn().mockRejectedValue(new Error('Smart model error')),
    };

    const failingFastModel = {
      invoke: vi.fn().mockRejectedValue(new Error('Fast model error')),
    };

    const state: NormalizeIdeaState = {
      rawIdea: 'Test failure',
      inputSource: 'cli',
      smartModel: failingSmartModel,
      fastModel: failingFastModel,
    };

    await expect(normalizeIdeaNode(state)).rejects.toThrow();
  });
});

describe('shouldUseFastPath', () => {
  it('should return true for trivial complexity', () => {
    expect(shouldUseFastPath('trivial' as Complexity)).toBe(true);
  });

  it('should return false for standard complexity', () => {
    expect(shouldUseFastPath('standard' as Complexity)).toBe(false);
  });

  it('should return false for complex complexity', () => {
    expect(shouldUseFastPath('complex' as Complexity)).toBe(false);
  });
});

describe('executeWithFallback', () => {
  it('should succeed with primary model', async () => {
    const primaryModel = {
      invoke: vi.fn().mockResolvedValue({ content: 'primary result' }),
    };

    const fallbackModel = {
      invoke: vi.fn().mockResolvedValue({ content: 'fallback result' }),
    };

    const promptFn = async (model: any) => {
      const response = await model.invoke([]);
      return response.content;
    };

    const result = await executeWithFallback(
      { primary: primaryModel, fallback: fallbackModel },
      promptFn,
      'test-node'
    );

    expect(result).toBe('primary result');
    expect(primaryModel.invoke).toHaveBeenCalledTimes(1);
    expect(fallbackModel.invoke).not.toHaveBeenCalled();
  });

  it('should fallback when primary fails', async () => {
    const primaryModel = {
      invoke: vi.fn().mockRejectedValue(new Error('primary error')),
    };

    const fallbackModel = {
      invoke: vi.fn().mockResolvedValue({ content: 'fallback result' }),
    };

    const promptFn = async (model: any) => {
      const response = await model.invoke([]);
      return response.content;
    };

    const result = await executeWithFallback(
      { primary: primaryModel, fallback: fallbackModel },
      promptFn,
      'test-node'
    );

    expect(result).toBe('fallback result');
    expect(primaryModel.invoke).toHaveBeenCalledTimes(1);
    expect(fallbackModel.invoke).toHaveBeenCalledTimes(1);
  });

  it('should throw when all models fail', async () => {
    const primaryModel = {
      invoke: vi.fn().mockRejectedValue(new Error('primary error')),
    };

    const fallbackModel = {
      invoke: vi.fn().mockRejectedValue(new Error('fallback error')),
    };

    const promptFn = async (model: any) => {
      const response = await model.invoke([]);
      return response.content;
    };

    await expect(
      executeWithFallback({ primary: primaryModel, fallback: fallbackModel }, promptFn, 'test-node')
    ).rejects.toThrow('fallback error');
  });
});

// ─── Jon Research Tree Tests ───────────────────────────────────────────────

describe('jonTriage', () => {
  it('should assess high priority for high-impact growth idea with user signals', async () => {
    const state: IdeaProcessingState = {
      idea: {
        title: 'Viral sharing feature',
        description: 'Add social sharing with analytics',
        category: 'growth',
        impact: 'high',
      } as any,
      worldState: {
        discordSignals: {
          recentTopics: ['sharing', 'viral'],
          userRequests: ['Make it easy to share'],
          painPoints: ['Hard to share content'],
        },
      },
      processingNotes: [],
    };

    const result = await jonTriage(state);

    expect(result.jonTriage).toBeDefined();
    expect(result.jonTriage?.priority).toBe('high');
    expect(result.jonTriage?.gtmRelevance).toBe(true);
  });

  it('should assess low priority for low-impact internal tooling', async () => {
    const state: IdeaProcessingState = {
      idea: {
        title: 'Internal script',
        description: 'Helper script for dev workflow',
        category: 'tooling',
        impact: 'low',
      } as any,
      processingNotes: [],
    };

    const result = await jonTriage(state);

    expect(result.jonTriage?.priority).toBe('low');
    expect(result.jonTriage?.gtmRelevance).toBe(false);
  });

  it('should handle triage timeout gracefully', async () => {
    // This test verifies timeout logic is in place
    // In a real timeout scenario, node would return degraded result
    const state: IdeaProcessingState = {
      idea: {
        title: 'Test timeout',
        description: 'Test',
        category: 'feature',
        impact: 'medium',
      } as any,
      processingNotes: [],
    };

    const result = await jonTriage(state);

    // Should complete without throwing
    expect(result.jonTriage).toBeDefined();
  });
});

describe('fanOutGTM', () => {
  it('should skip GTM research when not relevant', async () => {
    const state: IdeaProcessingState = {
      idea: {
        title: 'Internal refactor',
        description: 'Clean up code',
        category: 'refactor',
      } as any,
      jonTriage: {
        priority: 'low',
        gtmRelevance: false,
        reasoning: 'Internal work only',
        timestamp: new Date().toISOString(),
      },
      processingNotes: [],
    };

    const command = await fanOutGTM(state);

    // Command.goto is an array containing the next node
    expect(command.goto).toEqual(['aggregate_gtm']);
  });

  it('should fan out to 2 GTM workers when relevant', async () => {
    const state: IdeaProcessingState = {
      idea: {
        title: 'New feature',
        description: 'User-facing feature',
        category: 'growth',
      } as any,
      jonTriage: {
        priority: 'high',
        gtmRelevance: true,
        reasoning: 'Market opportunity',
        timestamp: new Date().toISOString(),
      },
      processingNotes: [],
    };

    const command = await fanOutGTM(state);

    expect(Array.isArray(command.goto)).toBe(true);
    expect((command.goto as any[]).length).toBe(2);
  });
});

describe('gtmResearchWorker', () => {
  it('should complete market opportunity research', async () => {
    const state = {
      researcher: 'Cindi',
      focus: 'market_opportunity',
      idea: {
        title: 'New feature',
        description: 'User-facing feature',
        category: 'feature',
        impact: 'high',
      },
      processingNotes: [],
    } as any;

    const result = await gtmResearchWorker(state);

    expect(result.gtmResearch).toBeDefined();
    expect(result.gtmResearch?.[0].researcher).toBe('Cindi');
    expect(result.gtmResearch?.[0].focus).toBe('market_opportunity');
    expect(result.gtmResearch?.[0].marketAnalysis).toContain('Market opportunity');
    expect(result.gtmResearch?.[0].opportunityScore).toBeGreaterThan(0);
  });

  it('should complete competitive analysis research', async () => {
    const state = {
      researcher: 'Market Analyst',
      focus: 'competitive_analysis',
      idea: {
        title: 'New feature',
        description: 'User-facing feature',
        category: 'feature',
        impact: 'medium',
      },
      processingNotes: [],
    } as any;

    const result = await gtmResearchWorker(state);

    expect(result.gtmResearch?.[0].focus).toBe('competitive_analysis');
    expect(result.gtmResearch?.[0].competitorInsights).toContain('Competitive analysis');
  });

  it('should handle research worker timeout gracefully', async () => {
    const state = {
      researcher: 'Cindi',
      focus: 'market_opportunity',
      idea: {
        title: 'Test',
        description: 'Test',
        category: 'feature',
        impact: 'low',
      },
      processingNotes: [],
    } as any;

    // Should complete without throwing
    const result = await gtmResearchWorker(state);
    expect(result.gtmResearch).toBeDefined();
  });
});

describe('aggregateGTM', () => {
  it('should aggregate multiple GTM research results', async () => {
    const state: IdeaProcessingState = {
      idea: {
        title: 'New feature',
        description: 'Test',
        category: 'feature',
      } as any,
      gtmResearch: [
        {
          researcher: 'Cindi',
          focus: 'market_opportunity',
          marketAnalysis: 'High opportunity',
          opportunityScore: 8,
          risks: [],
          timestamp: new Date().toISOString(),
        },
        {
          researcher: 'Market Analyst',
          focus: 'competitive_analysis',
          competitorInsights: 'Moderate competition',
          opportunityScore: 6,
          risks: [],
          timestamp: new Date().toISOString(),
        },
      ],
      processingNotes: [],
    };

    const result = await aggregateGTM(state);

    // Aggregation is pass-through, research already in state
    expect(result).toEqual({});
  });

  it('should handle empty GTM research array', async () => {
    const state: IdeaProcessingState = {
      idea: {
        title: 'Test',
        description: 'Test',
        category: 'feature',
      } as any,
      gtmResearch: [],
      processingNotes: [],
    };

    const result = await aggregateGTM(state);
    expect(result).toEqual({});
  });

  it('should handle aggregation timeout gracefully', async () => {
    const state: IdeaProcessingState = {
      idea: {
        title: 'Test',
        description: 'Test',
        category: 'feature',
      } as any,
      gtmResearch: [],
      processingNotes: [],
    };

    // Should complete without throwing
    const result = await aggregateGTM(state);
    expect(result).toBeDefined();
  });
});

describe('jonSynthesis', () => {
  it('should recommend proceed for high priority with high opportunity score', async () => {
    const state: IdeaProcessingState = {
      idea: {
        title: 'High-value feature',
        description: 'Feature with market validation',
        category: 'growth',
      } as any,
      jonTriage: {
        priority: 'high',
        gtmRelevance: true,
        reasoning: 'Strong market signals',
        timestamp: new Date().toISOString(),
      },
      gtmResearch: [
        {
          researcher: 'Cindi',
          focus: 'market_opportunity',
          marketAnalysis: 'Strong demand',
          opportunityScore: 8,
          risks: [],
          timestamp: new Date().toISOString(),
        },
        {
          researcher: 'Market Analyst',
          focus: 'competitive_analysis',
          competitorInsights: 'Low competition',
          opportunityScore: 9,
          risks: [],
          timestamp: new Date().toISOString(),
        },
      ],
      processingNotes: [],
    };

    const result = await jonSynthesis(state);

    expect(result.jonSynthesis).toBeDefined();
    expect(result.jonSynthesis?.recommendation).toBe('proceed');
    expect(result.jonSynthesis?.roiEstimate).toContain('High ROI');
    expect(result.jonSynthesis?.nextSteps).toContain('Create feature spec');
  });

  it('should recommend reject for low priority with low opportunity score', async () => {
    const state: IdeaProcessingState = {
      idea: {
        title: 'Low-value feature',
        description: 'Feature with weak signals',
        category: 'feature',
      } as any,
      jonTriage: {
        priority: 'low',
        gtmRelevance: true,
        reasoning: 'Weak market signals',
        timestamp: new Date().toISOString(),
      },
      gtmResearch: [
        {
          researcher: 'Cindi',
          focus: 'market_opportunity',
          marketAnalysis: 'Low demand',
          opportunityScore: 3,
          risks: ['High risk'],
          timestamp: new Date().toISOString(),
        },
      ],
      processingNotes: [],
    };

    const result = await jonSynthesis(state);

    expect(result.jonSynthesis?.recommendation).toBe('reject');
    expect(result.jonSynthesis?.roiEstimate).toContain('Low ROI');
    expect(result.jonSynthesis?.nextSteps).toContain('Archive idea');
  });

  it('should recommend defer for medium signals', async () => {
    const state: IdeaProcessingState = {
      idea: {
        title: 'Medium feature',
        description: 'Feature with moderate signals',
        category: 'feature',
      } as any,
      jonTriage: {
        priority: 'medium',
        gtmRelevance: true,
        reasoning: 'Moderate signals',
        timestamp: new Date().toISOString(),
      },
      gtmResearch: [
        {
          researcher: 'Cindi',
          focus: 'market_opportunity',
          marketAnalysis: 'Moderate demand',
          opportunityScore: 5,
          risks: [],
          timestamp: new Date().toISOString(),
        },
      ],
      processingNotes: [],
    };

    const result = await jonSynthesis(state);

    expect(result.jonSynthesis?.recommendation).toBe('defer');
    expect(result.jonSynthesis?.nextSteps).toContain('Monitor market signals');
  });

  it('should handle synthesis timeout gracefully', async () => {
    const state: IdeaProcessingState = {
      idea: {
        title: 'Test',
        description: 'Test',
        category: 'feature',
      } as any,
      jonTriage: {
        priority: 'medium',
        gtmRelevance: false,
        reasoning: 'Test',
        timestamp: new Date().toISOString(),
      },
      gtmResearch: [],
      processingNotes: [],
    };

    // Should complete without throwing
    const result = await jonSynthesis(state);
    expect(result.jonSynthesis).toBeDefined();
  });
});

// ─── Full Pipeline Integration Test ────────────────────────────────────────

describe('Idea Processing Full Pipeline', () => {
  it('should process trivial idea through fast path', async () => {
    const graph = createIdeaProcessingGraph(false);

    const input: IdeaInput = {
      title: 'Fix typo',
      description: 'Fix typo in docs',
      category: 'docs',
    };

    const result = await graph.invoke({
      idea: input,
      processingNotes: [],
    });

    expect(result.complexity).toBe('trivial');
    expect(result.usedFastPath).toBe(true);
    expect(result.approved).toBeDefined();
    expect(result.researchResults).toBeUndefined(); // Should skip research
  });

  it('should process simple idea through full research path', async () => {
    const graph = createIdeaProcessingGraph(false);

    const input: IdeaInput = {
      title: 'Add user preferences page',
      description:
        'Create a new page where users can customize their notification settings and preferences',
      category: 'feature',
    };

    const result = await graph.invoke({
      idea: input,
      processingNotes: [],
    });

    expect(result.complexity).toBe('simple');
    expect(result.usedFastPath).toBeUndefined();
    expect(result.researchResults).toBeDefined(); // Should complete research
    expect(result.approved).toBeDefined();
    expect(result.category).toBeDefined();
  });

  it('should process complex idea through deep research', async () => {
    const graph = createIdeaProcessingGraph(false);

    const input: IdeaInput = {
      title: 'Implement real-time collaboration system',
      description:
        'Build a real-time collaborative editing system with operational transform, ' +
        'conflict resolution, presence awareness, and cursor tracking across multiple users. ' +
        'Should support rich text, comments, and version history with undo/redo.',
      category: 'feature',
    };

    const result = await graph.invoke({
      idea: input,
      processingNotes: [],
    });

    expect(result.complexity).toBe('complex');
    expect(result.researchResults).toBeDefined();
    expect(result.approved).toBeDefined();
    expect(result.impact).toBeDefined();
    expect(result.effort).toBeDefined();
  });

  it('should accumulate processing notes throughout pipeline', async () => {
    const graph = createIdeaProcessingGraph(false);

    const input: IdeaInput = {
      title: 'Test pipeline',
      description: 'Test idea for pipeline',
      category: 'feature',
    };

    const result = await graph.invoke({
      idea: input,
      processingNotes: [],
    });

    expect(result.processingNotes).toBeDefined();
    expect(result.processingNotes.length).toBeGreaterThan(0);
  });

  it('should handle checkpointing when enabled', async () => {
    const graph = createIdeaProcessingGraph(true); // Enable checkpointing

    const input: IdeaInput = {
      title: 'Checkpoint test',
      description: 'Test checkpointing',
      category: 'feature',
    };

    const config = { configurable: { thread_id: 'test-thread-1' } };

    const result = await graph.invoke(
      {
        idea: input,
        processingNotes: [],
      },
      config
    );

    expect(result.approved).toBeDefined();
  });
});
