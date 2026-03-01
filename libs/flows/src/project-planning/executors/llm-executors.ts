/**
 * LLM-powered executors for the project planning flow.
 *
 * These replace the mock executors with real LLM calls using LangChain's BaseChatModel.
 * Each executor follows the same pattern:
 *   1. Build a detailed prompt with all available context
 *   2. Call model.invoke() with the prompt
 *   3. Parse the structured response (JSON in markdown code blocks)
 *   4. Return the typed result
 *
 * Usage (server-side):
 *   const model = createLangChainModel({ model: 'claude-sonnet' });
 *   const flow = createProjectPlanningFlow({
 *     researchExecutor: createLLMResearchExecutor(model),
 *     planningDocGenerator: createLLMPlanningDocGenerator(model),
 *     ...
 *   });
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ResearchExecutor } from '../nodes/research.js';
import type { PlanningDocGenerator } from '../nodes/create-planning-doc.js';
import type { DeepResearchExecutor } from '../nodes/deep-research.js';
import type { PRDGenerator } from '../nodes/generate-prd.js';
import type { MilestonePlanner } from '../nodes/plan-milestones.js';
import type { ResearchReport, ResearchFinding, SPARCSection, PlannedMilestone } from '../types.js';

/**
 * Extract JSON from LLM response, handling markdown code blocks.
 */
function extractJSON<T>(raw: string): T {
  let jsonStr = raw.trim();

  // Try extracting from markdown code block first
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  return JSON.parse(jsonStr) as T;
}

/**
 * Invoke model and return the text content of the response.
 */
async function invokeModel(model: BaseChatModel, prompt: string): Promise<string> {
  const response = await model.invoke([{ role: 'user', content: prompt }]);
  return typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
}

// ─── Research Executor ──────────────────────────────────────────────────────

/**
 * Creates an LLM-powered research executor that analyzes the project
 * description and produces a structured ResearchReport.
 */
export function createLLMResearchExecutor(model: BaseChatModel): ResearchExecutor {
  return {
    async research(
      projectName: string,
      description: string,
      projectPath: string
    ): Promise<ResearchReport> {
      const prompt = `You are a senior software architect analyzing a project before planning.

## Project
- **Name:** ${projectName}
- **Repository:** ${projectPath}
- **Description:** ${description}

## Task
Analyze this project description and produce a structured research report. Consider:
1. What key technical areas need investigation?
2. What existing patterns or infrastructure might be relevant?
3. What constraints or risks exist?
4. What approach would you recommend?

## Output Format
Return a JSON object matching this schema:

\`\`\`json
{
  "projectName": "${projectName}",
  "findings": [
    {
      "topic": "string - area of investigation",
      "summary": "string - what was found",
      "relevantFiles": ["string - file paths that may be relevant"],
      "patterns": ["string - existing patterns to follow"],
      "risks": ["string - potential risks"]
    }
  ],
  "codebaseContext": "string - overall codebase context and structure",
  "technicalConstraints": ["string - hard constraints to respect"],
  "existingPatterns": ["string - patterns the implementation should follow"],
  "suggestedApproach": "string - recommended high-level approach"
}
\`\`\`

Produce 3-6 findings covering the most important areas. Be specific and actionable.
Return ONLY the JSON object wrapped in a code block.`;

      const raw = await invokeModel(model, prompt);
      return extractJSON<ResearchReport>(raw);
    },
  };
}

// ─── Planning Doc Generator ─────────────────────────────────────────────────

/**
 * Creates an LLM-powered planning document generator that synthesizes
 * research findings into a high-level planning document.
 */
export function createLLMPlanningDocGenerator(model: BaseChatModel): PlanningDocGenerator {
  return {
    async generate(
      projectName: string,
      description: string,
      research: ResearchReport
    ): Promise<string> {
      const findingsSummary = research.findings
        .map(
          (f) =>
            `### ${f.topic}\n${f.summary}\n- Files: ${f.relevantFiles?.join(', ') || 'TBD'}\n- Patterns: ${f.patterns?.join(', ') || 'None identified'}\n- Risks: ${f.risks?.join(', ') || 'None identified'}`
        )
        .join('\n\n');

      const prompt = `You are a senior software architect creating a planning document.

## Project: ${projectName}
${description}

## Research Findings
${findingsSummary}

## Codebase Context
${research.codebaseContext}

## Technical Constraints
${research.technicalConstraints.map((c) => `- ${c}`).join('\n') || '- None identified'}

## Existing Patterns
${research.existingPatterns.map((p) => `- ${p}`).join('\n') || '- None identified'}

## Suggested Approach
${research.suggestedApproach}

## Task
Write a comprehensive planning document in markdown. Include:

1. **Executive Summary** — What this project delivers and why
2. **Scope** — In scope vs out of scope
3. **Architecture** — How this fits into the existing system
4. **Key Decisions** — Technical choices that need to be made
5. **Implementation Strategy** — High-level approach and phasing
6. **Risk Mitigation** — How to handle identified risks
7. **Dependencies** — What this project depends on
8. **Next Steps** — What happens after this plan is approved

Write the full markdown document. Be specific, referencing actual file paths and patterns from the research.`;

      return invokeModel(model, prompt);
    },
  };
}

// ─── Deep Research Executor ─────────────────────────────────────────────────

/**
 * Creates an LLM-powered deep research executor that produces detailed
 * implementation analysis from the approved planning document.
 */
export function createLLMDeepResearchExecutor(model: BaseChatModel): DeepResearchExecutor {
  return {
    async deepResearch(
      projectName: string,
      planningDoc: string,
      research: ResearchReport,
      projectPath: string
    ): Promise<string> {
      const prompt = `You are a senior software architect performing deep implementation research.

## Project: ${projectName}
**Repository:** ${projectPath}

## Approved Planning Document
${planningDoc}

## Initial Research Summary
- **Codebase Context:** ${research.codebaseContext}
- **Constraints:** ${research.technicalConstraints.join(', ') || 'None'}
- **Patterns:** ${research.existingPatterns.join(', ') || 'None'}
- **Findings:** ${research.findings.map((f) => `${f.topic}: ${f.summary}`).join('; ')}

## Task
Perform a deep technical dive. Produce a detailed implementation analysis document in markdown covering:

1. **File-by-File Analysis** — Which files need to be created/modified, with specific changes
2. **Dependency Map** — Internal and external dependencies, build order
3. **Integration Points** — Where new code connects to existing code (specific functions, methods, imports)
4. **Data Flow** — How data moves through the system for new features
5. **API Surface** — New/modified endpoints, types, interfaces
6. **Migration Path** — Steps to go from current state to target state
7. **Test Strategy** — What to test, how to test it, critical test cases
8. **Risk Assessment** — Technical risks with specific mitigation strategies

Be extremely specific. Reference actual file paths, function names, and patterns from the codebase.
This document will be used by AI agents to implement the features — precision matters.`;

      return invokeModel(model, prompt);
    },
  };
}

// ─── PRD Generator ──────────────────────────────────────────────────────────

/**
 * Creates an LLM-powered PRD generator that produces a SPARC PRD
 * from the approved research and planning documents.
 */
export function createLLMPRDGenerator(model: BaseChatModel): PRDGenerator {
  return {
    async generate(
      projectName: string,
      description: string,
      planningDoc: string,
      researchDoc: string,
      feedback?: string
    ): Promise<SPARCSection> {
      const feedbackSection = feedback
        ? `\n## Revision Feedback\nThe previous version was sent back with this feedback:\n${feedback}\n\nAddress ALL feedback points in this revision.`
        : '';

      const prompt = `You are a product architect creating a SPARC PRD (Situation, Problem, Approach, Results, Constraints).

## Project: ${projectName}
${description}

## Planning Document
${planningDoc}

## Deep Research Document
${researchDoc}
${feedbackSection}

## Task
Generate a SPARC PRD. Each section should be 2-4 paragraphs of substantive content.

Return a JSON object:

\`\`\`json
{
  "situation": "Current state of the system and market context. What exists today and why this project matters.",
  "problem": "Specific problems being solved. What's missing, broken, or suboptimal. Include user impact.",
  "approach": "Technical approach and architecture. How the solution will be built. Reference specific technologies, patterns, and integration points.",
  "results": "Expected outcomes and success metrics. What will be true when this ships.",
  "constraints": [
    "Hard constraint 1",
    "Hard constraint 2",
    "Hard constraint 3"
  ]
}
\`\`\`

Make each SPARC section substantive (2-4 paragraphs). Constraints should be 3-8 specific items.
Return ONLY the JSON object wrapped in a code block.`;

      const raw = await invokeModel(model, prompt);
      return extractJSON<SPARCSection>(raw);
    },
  };
}

// ─── Milestone Planner ──────────────────────────────────────────────────────

/**
 * Creates an LLM-powered milestone planner that breaks the PRD into
 * milestones with implementation phases.
 */
export function createLLMMilestonePlanner(model: BaseChatModel): MilestonePlanner {
  return {
    async plan(
      projectName: string,
      prd: SPARCSection,
      researchDoc: string,
      feedback?: string
    ): Promise<PlannedMilestone[]> {
      const feedbackSection = feedback
        ? `\n## Revision Feedback\nThe previous milestone plan was sent back with this feedback:\n${feedback}\n\nAddress ALL feedback points in this revision.`
        : '';

      const prompt = `You are a project architect decomposing a PRD into implementable milestones.

## Project: ${projectName}

## SPARC PRD
**Situation:** ${prd.situation}
**Problem:** ${prd.problem}
**Approach:** ${prd.approach}
**Results:** ${prd.results}
**Constraints:** ${prd.constraints.map((c) => `- ${c}`).join('\n')}

## Deep Research Document
${researchDoc}
${feedbackSection}

## Task
Break this project into 2-5 milestones. Each milestone has ordered phases.

Rules:
- Each phase should be completable by a single AI agent in 30-60 minutes
- Phase complexity: "small" (< 100 lines), "medium" (100-300 lines), "large" (300+ lines)
- First milestone is always "Foundation" (types, interfaces, infrastructure)
- Phases within a milestone are ordered — later phases may depend on earlier ones
- filesToModify should be specific paths, not directories
- acceptanceCriteria should be verifiable (can be checked by running tests, builds, etc.)

Return a JSON array:

\`\`\`json
[
  {
    "title": "Foundation",
    "description": "Core types, interfaces, and infrastructure",
    "phases": [
      {
        "title": "Type Definitions",
        "description": "Create TypeScript types for the feature",
        "filesToModify": ["libs/types/src/my-feature.ts"],
        "acceptanceCriteria": [
          "Types compile with tsc",
          "Exported from libs/types/src/index.ts"
        ],
        "complexity": "small"
      }
    ]
  }
]
\`\`\`

Return ONLY the JSON array wrapped in a code block.`;

      const raw = await invokeModel(model, prompt);
      return extractJSON<PlannedMilestone[]>(raw);
    },
  };
}
