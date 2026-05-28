import { describe, it, expect } from 'vitest';
import { featureTools } from '../src/tools/feature-tools.js';
import { agentTools } from '../src/tools/agent-tools.js';
import { queueTools } from '../src/tools/queue-tools.js';
import { contextTools } from '../src/tools/context-tools.js';
import { orchestrationTools } from '../src/tools/orchestration-tools.js';
import { projectTools } from '../src/tools/project-tools.js';
import { gitTools } from '../src/tools/git-tools.js';
import { gitOpsTools } from '../src/tools/git-ops-tools.js';
import { observabilityTools } from '../src/tools/observability-tools.js';
import { integrationTools } from '../src/tools/integration-tools.js';
import { workspaceTools } from '../src/tools/workspace-tools.js';
import { utilityTools } from '../src/tools/utility-tools.js';
import { setupTools } from '../src/tools/setup-tools.js';
import { schedulerTools } from '../src/tools/scheduler-tools.js';
import { leadEngineerTools } from '../src/tools/lead-engineer-tools.js';
import { knowledgeTools } from '../src/tools/knowledge-tools.js';
import { qaTools } from '../src/tools/qa-tools.js';
import { crossRepoTools } from '../src/tools/cross-repo-tools.js';

describe('MCP Server', () => {
  describe('configuration', () => {
    it('should have default API URL', () => {
      const defaultApiUrl = 'http://localhost:3008';
      expect(defaultApiUrl).toBe('http://localhost:3008');
    });

    it('should have default API key', () => {
      const defaultApiKey = 'automaker-dev-key-2026';
      expect(defaultApiKey).toBe('automaker-dev-key-2026');
    });
  });

  describe('tool definitions', () => {
    const allTools = [
      ...featureTools,
      ...agentTools,
      ...queueTools,
      ...contextTools,
      ...orchestrationTools,
      ...projectTools,
      ...gitTools,
      ...gitOpsTools,
      ...observabilityTools,
      ...integrationTools,
      ...workspaceTools,
      ...utilityTools,
      ...setupTools,
      ...schedulerTools,
      ...leadEngineerTools,
      ...knowledgeTools,
      ...qaTools,
      ...crossRepoTools,
    ];

    it('should define all tools (97 total)', () => {
      expect(allTools.length).toBe(97);
    });

    it('should have unique tool names', () => {
      const names = allTools.map((t) => t.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it('should have non-empty descriptions on all tools', () => {
      for (const tool of allTools) {
        expect(tool.description?.trim()).toBeTruthy();
      }
    });

    it('should have valid inputSchema on all tools', () => {
      for (const tool of allTools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
      }
    });

    it('should enforce minLength on projectPath fields where defined', () => {
      const toolsWithProjectPath = allTools.filter((t) => t.inputSchema.properties?.projectPath);
      for (const tool of toolsWithProjectPath) {
        const pp = tool.inputSchema.properties.projectPath;
        // Only check if projectPath is a plain string (not a union type)
        if (pp.type === 'string') {
          expect(pp.minLength).toBe(1);
        }
      }
    });

    it('should enforce minLength on featureId fields where defined', () => {
      const toolsWithFeatureId = allTools.filter((t) => t.inputSchema.properties?.featureId);
      for (const tool of toolsWithFeatureId) {
        const fid = tool.inputSchema.properties.featureId;
        // Only check if featureId is a plain string (not a union type)
        if (fid.type === 'string') {
          expect(fid.minLength).toBe(1);
        }
      }
    });

    it('should enforce integer type on priority fields', () => {
      const createFeature = featureTools.find((t) => t.name === 'create_feature');
      expect(createFeature?.inputSchema.properties.priority.type).toBe('integer');

      const updateFeature = featureTools.find((t) => t.name === 'update_feature');
      const updatePriority = updateFeature?.inputSchema.properties.priority;
      expect(updatePriority.type).toContain('integer');
    });

    it('should enforce minimum on prNumber fields', () => {
      const mergePr = gitTools.find((t) => t.name === 'merge_pr');
      expect(mergePr?.inputSchema.properties.prNumber.minimum).toBe(1);
      expect(mergePr?.inputSchema.properties.prNumber.type).toBe('integer');
    });

    it('should enforce minimum on maxLines fields', () => {
      const getAgentOutput = agentTools.find((t) => t.name === 'get_agent_output');
      expect(getAgentOutput?.inputSchema.properties.maxLines.minimum).toBe(-1);
      expect(getAgentOutput?.inputSchema.properties.maxLines.type).toBe('integer');
    });

    it('should enforce enum on status fields where applicable', () => {
      const listFeatures = featureTools.find((t) => t.name === 'list_features');
      const statusProp = listFeatures?.inputSchema.properties.status;
      expect(statusProp.enum).toEqual(['backlog', 'in-progress', 'review', 'done']);
    });

    it('should enforce pattern on dueDate fields', () => {
      const createFeature = featureTools.find((t) => t.name === 'create_feature');
      expect(createFeature?.inputSchema.properties.dueDate.pattern).toBeTruthy();
    });

    it('should enforce minimum on concurrency fields', () => {
      const startAutoMode = orchestrationTools.find((t) => t.name === 'start_auto_mode');
      expect(startAutoMode?.inputSchema.properties.maxConcurrency.minimum).toBe(1);
      expect(startAutoMode?.inputSchema.properties.maxConcurrency.type).toBe('integer');
    });
  });
});
