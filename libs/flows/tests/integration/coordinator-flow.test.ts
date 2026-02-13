/**
 * Coordinator Flow Integration Tests
 *
 * Tests the coordinator graph with subgraph delegation,
 * message isolation, and dynamic parallelism using Send().
 */

import { describe, it, expect } from 'vitest';
import { createCoordinatorGraph } from '../../src/graphs/coordinator-flow.js';
import { createResearcherGraph } from '../../src/graphs/subgraphs/researcher.js';
import { createAnalyzerGraph } from '../../src/graphs/subgraphs/analyzer.js';

describe('Coordinator Flow', () => {
  describe('Parallel Execution', () => {
    it('should delegate to researcher and analyzer subgraphs in parallel', async () => {
      const graph = createCoordinatorGraph();
      const compiled = graph.compile();

      const result = await compiled.invoke({
        task: 'Analyze market trends',
        researchQueries: [],
        analysisData: [],
        researchResults: [],
        analysisResults: [],
        mode: 'parallel',
      });

      expect(result.task).toBe('Analyze market trends');
      expect(result.researchQueries).toHaveLength(3);
      expect(result.analysisData).toHaveLength(2);
      expect(result.researchResults.length).toBeGreaterThan(0);
      expect(result.analysisResults.length).toBeGreaterThan(0);
      expect(result.finalReport).toBeDefined();
      expect(result.finalReport).toContain('Final Report');
    });

    it('should use Send() for dynamic fan-out', async () => {
      const graph = createCoordinatorGraph();
      const compiled = graph.compile();

      const result = await compiled.invoke({
        task: 'Multi-aspect research',
        researchQueries: [],
        analysisData: [],
        researchResults: [],
        analysisResults: [],
        mode: 'parallel',
      });

      // Verify multiple research results from fan-out
      expect(result.researchResults.length).toBeGreaterThanOrEqual(3);
      expect(result.analysisResults.length).toBeGreaterThanOrEqual(2);
    });

    it('should maintain isolated message state in subgraphs', async () => {
      const graph = createCoordinatorGraph();
      const compiled = graph.compile();

      const result = await compiled.invoke({
        task: 'Test isolation',
        researchQueries: [],
        analysisData: [],
        researchResults: [],
        analysisResults: [],
        mode: 'parallel',
      });

      // Results should be present without message pollution
      expect(result.researchResults).toBeDefined();
      expect(result.analysisResults).toBeDefined();
      expect(result.finalReport).toBeDefined();

      // Coordinator state should not have subgraph messages
      expect(result).not.toHaveProperty('messages');
    });
  });

  describe('Sequential Execution', () => {
    it('should execute research then analysis sequentially', async () => {
      const graph = createCoordinatorGraph();
      const compiled = graph.compile();

      const result = await compiled.invoke({
        task: 'Sequential workflow',
        researchQueries: [],
        analysisData: [],
        researchResults: [],
        analysisResults: [],
        mode: 'sequential',
      });

      expect(result.researchResults.length).toBeGreaterThan(0);
      expect(result.analysisResults.length).toBeGreaterThan(0);
      expect(result.finalReport).toBeDefined();
    });

    it('should complete all research before analysis', async () => {
      const graph = createCoordinatorGraph();
      const compiled = graph.compile();

      const result = await compiled.invoke({
        task: 'Research-first workflow',
        researchQueries: [],
        analysisData: [],
        researchResults: [],
        analysisResults: [],
        mode: 'sequential',
      });

      // In sequential mode, all research completes before analysis
      expect(result.researchQueries.length).toBe(3);
      expect(result.researchResults.length).toBeGreaterThanOrEqual(3);
      expect(result.analysisResults.length).toBeGreaterThan(0);
    });
  });

  describe('Subgraph Integration', () => {
    it('should successfully delegate to researcher subgraph', async () => {
      const researcherGraph = createResearcherGraph();
      const compiled = researcherGraph.compile();

      const result = await compiled.invoke({
        query: 'Test query',
        findings: [],
        messages: [],
      });

      expect(result.findings).toHaveLength(3);
      expect(result.result).toBeDefined();
      expect(result.result).toContain('Research Summary');
      expect(result.messages.length).toBeGreaterThan(0);
    });

    it('should successfully delegate to analyzer subgraph', async () => {
      const analyzerGraph = createAnalyzerGraph();
      const compiled = analyzerGraph.compile();

      const result = await compiled.invoke({
        data: 'Test data for analysis',
        insights: [],
        messages: [],
      });

      expect(result.insights).toHaveLength(3);
      expect(result.result).toBeDefined();
      expect(result.result).toContain('Analysis Report');
      expect(result.messages.length).toBeGreaterThan(0);
    });
  });

  describe('Results Flow Back', () => {
    it('should aggregate results from all subgraphs', async () => {
      const graph = createCoordinatorGraph();
      const compiled = graph.compile();

      const result = await compiled.invoke({
        task: 'Comprehensive analysis',
        researchQueries: [],
        analysisData: [],
        researchResults: [],
        analysisResults: [],
        mode: 'parallel',
      });

      expect(result.finalReport).toBeDefined();
      expect(result.finalReport).toContain('Research Results');
      expect(result.finalReport).toContain('Analysis Results');
      expect(result.finalReport).toContain('Comprehensive analysis');
    });

    it('should preserve all research results in aggregation', async () => {
      const graph = createCoordinatorGraph();
      const compiled = graph.compile();

      const result = await compiled.invoke({
        task: 'Multi-result test',
        researchQueries: [],
        analysisData: [],
        researchResults: [],
        analysisResults: [],
        mode: 'parallel',
      });

      const reportLines = result.finalReport?.split('\n') || [];
      const researchSection = reportLines.find((line) => line.includes('Research Results'));
      expect(researchSection).toBeDefined();

      // Should have multiple research results
      expect(result.researchResults.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty task gracefully', async () => {
      const graph = createCoordinatorGraph();
      const compiled = graph.compile();

      const result = await compiled.invoke({
        task: '',
        researchQueries: [],
        analysisData: [],
        researchResults: [],
        analysisResults: [],
        mode: 'parallel',
      });

      expect(result.finalReport).toBeDefined();
    });

    it('should handle mode switching', async () => {
      const graph = createCoordinatorGraph();
      const compiled = graph.compile();

      const parallelResult = await compiled.invoke({
        task: 'Mode test',
        researchQueries: [],
        analysisData: [],
        researchResults: [],
        analysisResults: [],
        mode: 'parallel',
      });

      const sequentialResult = await compiled.invoke({
        task: 'Mode test',
        researchQueries: [],
        analysisData: [],
        researchResults: [],
        analysisResults: [],
        mode: 'sequential',
      });

      expect(parallelResult.finalReport).toBeDefined();
      expect(sequentialResult.finalReport).toBeDefined();
    });
  });
});
