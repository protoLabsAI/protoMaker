/**
 * Prompt Snapshot Tests
 *
 * Structural assertions for all default prompt categories.
 * Verifies prompts contain required sections/patterns without
 * asserting exact text (so prompts can evolve freely).
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_PROMPTS } from '../src/defaults.js';

describe('prompt snapshots — structural assertions', () => {
  describe('autoMode prompts', () => {
    const { autoMode } = DEFAULT_PROMPTS;

    it('featurePromptTemplate contains feature context variables', () => {
      expect(autoMode.featurePromptTemplate).toContain('{{featureId}}');
      expect(autoMode.featurePromptTemplate).toContain('{{title}}');
      expect(autoMode.featurePromptTemplate).toContain('{{description}}');
    });

    it('featurePromptTemplate includes conditional blocks', () => {
      // Template uses Handlebars conditionals for optional sections
      expect(autoMode.featurePromptTemplate).toContain('{{#if');
    });

    it('planningLite contains planning structure', () => {
      expect(autoMode.planningLite.length).toBeGreaterThan(100);
      expect(autoMode.planningLite).toMatch(/plan|approach|implement/i);
    });

    it('planningSpec is more detailed than planningLite', () => {
      expect(autoMode.planningSpec.length).toBeGreaterThan(autoMode.planningLite.length);
    });

    it('planningFull is most detailed planning prompt', () => {
      expect(autoMode.planningFull.length).toBeGreaterThan(autoMode.planningSpec.length);
    });

    it('followUpPromptTemplate references previous work', () => {
      expect(autoMode.followUpPromptTemplate).toMatch(/previous|continue|follow.?up|remaining/i);
    });

    it('continuationPromptTemplate handles agent restart', () => {
      expect(autoMode.continuationPromptTemplate).toMatch(/continu|resum|pick.?up/i);
    });

    it('pipelineStepPromptTemplate contains step context', () => {
      expect(autoMode.pipelineStepPromptTemplate.length).toBeGreaterThan(50);
    });
  });

  describe('taskExecution prompts', () => {
    const { taskExecution } = DEFAULT_PROMPTS;

    it('implementationInstructions has scope discipline section', () => {
      expect(taskExecution.implementationInstructions).toMatch(/scope discipline/i);
    });

    it('implementationInstructions has turn budget', () => {
      expect(taskExecution.implementationInstructions).toMatch(/turn budget/i);
    });

    it('implementationInstructions has verification gates', () => {
      expect(taskExecution.implementationInstructions).toMatch(/verification gates/i);
    });

    it('implementationInstructions has risk awareness', () => {
      expect(taskExecution.implementationInstructions).toMatch(/risk/i);
    });

    it('implementationInstructions has "when stuck" guidance', () => {
      expect(taskExecution.implementationInstructions).toMatch(/when stuck/i);
    });

    it('implementationInstructions has red flags section', () => {
      expect(taskExecution.implementationInstructions).toMatch(/red flag/i);
    });

    it('taskPromptTemplate contains task variables', () => {
      expect(taskExecution.taskPromptTemplate).toContain('{{taskId}}');
      expect(taskExecution.taskPromptTemplate).toContain('{{taskDescription}}');
    });

    it('learningExtractionSystemPrompt exists and is non-trivial', () => {
      expect(taskExecution.learningExtractionSystemPrompt.length).toBeGreaterThan(50);
    });

    it('playwrightVerificationInstructions mentions browser testing', () => {
      expect(taskExecution.playwrightVerificationInstructions).toMatch(
        /playwright|browser|e2e|test/i
      );
    });
  });

  describe('agent prompts', () => {
    const { agent } = DEFAULT_PROMPTS;

    it('systemPrompt is non-trivial', () => {
      expect(agent.systemPrompt.length).toBeGreaterThan(100);
    });

    it('systemPrompt contains role context', () => {
      expect(agent.systemPrompt).toMatch(/implement|feature|task|code/i);
    });
  });

  describe('backlogPlan prompts', () => {
    const { backlogPlan } = DEFAULT_PROMPTS;

    it('systemPrompt handles planning tasks', () => {
      expect(backlogPlan.systemPrompt.length).toBeGreaterThan(50);
    });

    it('userPromptTemplate has placeholder for feature context', () => {
      expect(backlogPlan.userPromptTemplate.length).toBeGreaterThan(50);
    });
  });

  describe('enhancement prompts', () => {
    const { enhancement } = DEFAULT_PROMPTS;

    it('has all 5 enhancement modes', () => {
      expect(enhancement.improveSystemPrompt).toBeDefined();
      expect(enhancement.technicalSystemPrompt).toBeDefined();
      expect(enhancement.simplifySystemPrompt).toBeDefined();
      expect(enhancement.acceptanceSystemPrompt).toBeDefined();
      expect(enhancement.uxReviewerSystemPrompt).toBeDefined();
    });

    it('each mode has non-trivial content', () => {
      for (const [, prompt] of Object.entries(enhancement)) {
        expect(prompt.length).toBeGreaterThan(50);
      }
    });
  });

  describe('commitMessage prompts', () => {
    const { commitMessage } = DEFAULT_PROMPTS;

    it('systemPrompt mentions commit conventions', () => {
      expect(commitMessage.systemPrompt).toMatch(/commit|message|convention|format/i);
    });
  });

  describe('titleGeneration prompts', () => {
    const { titleGeneration } = DEFAULT_PROMPTS;

    it('systemPrompt handles title generation', () => {
      expect(titleGeneration.systemPrompt.length).toBeGreaterThan(50);
    });
  });

  describe('issueValidation prompts', () => {
    const { issueValidation } = DEFAULT_PROMPTS;

    it('systemPrompt validates issues', () => {
      expect(issueValidation.systemPrompt.length).toBeGreaterThan(50);
    });
  });

  describe('ideation prompts', () => {
    const { ideation } = DEFAULT_PROMPTS;

    it('has ideation and suggestions system prompts', () => {
      expect(ideation.ideationSystemPrompt).toBeDefined();
      expect(ideation.suggestionsSystemPrompt).toBeDefined();
    });
  });

  describe('appSpec prompts', () => {
    const { appSpec } = DEFAULT_PROMPTS;

    it('has generate, structured, and features prompts', () => {
      expect(appSpec.generateSpecSystemPrompt).toBeDefined();
      expect(appSpec.structuredSpecInstructions).toBeDefined();
      expect(appSpec.generateFeaturesFromSpecPrompt).toBeDefined();
    });

    it('each is non-trivial', () => {
      for (const [, prompt] of Object.entries(appSpec)) {
        expect(prompt.length).toBeGreaterThan(50);
      }
    });
  });

  describe('contextDescription prompts', () => {
    const { contextDescription } = DEFAULT_PROMPTS;

    it('has file and image description prompts', () => {
      expect(contextDescription.describeFilePrompt).toBeDefined();
      expect(contextDescription.describeImagePrompt).toBeDefined();
    });
  });

  describe('suggestions prompts', () => {
    const { suggestions } = DEFAULT_PROMPTS;

    it('has all suggestion categories', () => {
      expect(suggestions.featuresPrompt).toBeDefined();
      expect(suggestions.refactoringPrompt).toBeDefined();
      expect(suggestions.securityPrompt).toBeDefined();
      expect(suggestions.performancePrompt).toBeDefined();
      expect(suggestions.baseTemplate).toBeDefined();
    });
  });

  describe('all categories present', () => {
    it('DEFAULT_PROMPTS has all 12 categories', () => {
      const categories = Object.keys(DEFAULT_PROMPTS);
      expect(categories).toContain('autoMode');
      expect(categories).toContain('agent');
      expect(categories).toContain('backlogPlan');
      expect(categories).toContain('enhancement');
      expect(categories).toContain('commitMessage');
      expect(categories).toContain('titleGeneration');
      expect(categories).toContain('issueValidation');
      expect(categories).toContain('ideation');
      expect(categories).toContain('appSpec');
      expect(categories).toContain('contextDescription');
      expect(categories).toContain('suggestions');
      expect(categories).toContain('taskExecution');
      expect(categories.length).toBe(12);
    });
  });
});
