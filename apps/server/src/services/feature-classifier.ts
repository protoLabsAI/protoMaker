/**
 * Feature Classifier Service
 *
 * Uses Haiku to classify features into agent roles based on description.
 * Single-turn query with <2s timeout, fallback to backend-engineer on low confidence.
 */

import { createLogger } from '@automaker/utils';
import { simpleQuery } from '../providers/simple-query-service.js';
import type { AgentRole } from '@automaker/types';

const logger = createLogger('FeatureClassifier');

/** Valid roles for classification */
const VALID_ROLES: AgentRole[] = [
  'frontend-engineer',
  'backend-engineer',
  'devops-engineer',
  'gtm-specialist',
];

const DEFAULT_ROLE: AgentRole = 'backend-engineer';
const CONFIDENCE_THRESHOLD = 0.6;
const TIMEOUT_MS = 5000;

/**
 * Classification result from the AI
 */
export interface ClassificationResult {
  role: AgentRole;
  confidence: number;
  reasoning: string;
}

const SYSTEM_PROMPT = `You are a feature classifier for an AI development studio. Given a feature title and description, classify it into exactly one agent role.

Available roles:
- frontend-engineer: React components, UI/UX, Tailwind CSS, Storybook, design systems, theming, user-facing visuals
- backend-engineer: Express routes, services, database, API endpoints, WebSocket, server logic, TypeScript types
- devops-engineer: CI/CD pipelines, Docker, deployment, infrastructure, monitoring, staging environments
- gtm-specialist: Marketing content, social media, documentation for external users, competitive analysis

Respond with ONLY valid JSON (no markdown, no code fences):
{"role": "<role>", "confidence": <0.0-1.0>, "reasoning": "<brief explanation>"}

Rules:
- confidence should reflect how clearly the feature fits one role
- If the feature spans multiple roles, pick the PRIMARY role and lower confidence
- If unclear, default to backend-engineer with low confidence`;

/**
 * Classify a feature into an agent role using Haiku
 */
export async function classifyFeature(
  title: string,
  description: string,
  cwd: string
): Promise<ClassificationResult> {
  const prompt = `Classify this feature:

Title: ${title}
Description: ${description}`;

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), TIMEOUT_MS);

  try {
    const result = await simpleQuery({
      prompt,
      systemPrompt: SYSTEM_PROMPT,
      model: 'claude-haiku',
      cwd,
      maxTurns: 1,
      allowedTools: [],
      abortController,
    });

    clearTimeout(timeoutId);

    return parseClassification(result.text);
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      logger.warn('Feature classification timed out, using default role');
    } else {
      logger.error('Feature classification failed:', error);
    }

    return {
      role: DEFAULT_ROLE,
      confidence: 0,
      reasoning: `Classification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Parse and validate the AI response into a ClassificationResult
 */
function parseClassification(text: string): ClassificationResult {
  try {
    // Strip markdown code fences if present
    const cleaned = text.replace(/```(?:json)?\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const role = parsed.role as AgentRole;
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
    const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : '';

    // Validate role
    if (!VALID_ROLES.includes(role)) {
      logger.warn(`Invalid role "${role}" from classifier, falling back to ${DEFAULT_ROLE}`);
      return { role: DEFAULT_ROLE, confidence: 0, reasoning: `Invalid role: ${role}` };
    }

    // Apply confidence threshold
    if (confidence < CONFIDENCE_THRESHOLD) {
      logger.info(
        `Low confidence (${confidence}) for role "${role}", falling back to ${DEFAULT_ROLE}`
      );
      return { role: DEFAULT_ROLE, confidence, reasoning };
    }

    return { role, confidence, reasoning };
  } catch (error) {
    logger.error('Failed to parse classification response:', text);
    return {
      role: DEFAULT_ROLE,
      confidence: 0,
      reasoning: `Parse error: ${error instanceof Error ? error.message : 'Invalid JSON'}`,
    };
  }
}
