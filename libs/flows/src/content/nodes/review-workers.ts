/**
 * Review Worker Nodes
 *
 * Three specialized reviewers that execute in parallel:
 * 1. TechnicalReviewer - validates code examples and technical accuracy
 * 2. StyleReviewer - checks tone, readability, and audience fit
 * 3. FactChecker - verifies claims against research findings
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { createLogger } from '@automaker/utils';
import { LangfuseClient } from '@automaker/observability';
import { compilePrompt } from '../prompt-loader.js';

const logger = createLogger('review-workers');

/**
 * Review finding severity levels
 */
export type ReviewSeverity = 'info' | 'warning' | 'error';

/**
 * Review finding from a worker
 */
export interface ReviewFinding {
  reviewer: string;
  severity: ReviewSeverity;
  message: string;
  location?: string; // Optional location reference in content
  suggestion?: string; // Optional fix suggestion
  timestamp: string;
}

/**
 * State for a review worker
 */
export interface ReviewWorkerState {
  content: string;
  researchFindings?: string; // For fact checking
  findings: ReviewFinding[];
  model?: BaseChatModel; // LangChain chat model for LLM-powered review
  langfuseClient?: LangfuseClient; // Optional Langfuse tracing
  traceId?: string; // Trace ID for Langfuse
}

/**
 * Parse XML findings from LLM response
 */
function parseXmlFindings(xmlText: string, reviewer: string): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const timestamp = new Date().toISOString();

  // Extract all <finding> blocks
  const findingRegex = /<finding>([\s\S]*?)<\/finding>/g;
  let match;

  while ((match = findingRegex.exec(xmlText)) !== null) {
    const findingContent = match[1];

    // Extract severity
    const severityMatch = findingContent.match(/<severity>(error|warning|info)<\/severity>/);
    const severity = (severityMatch?.[1] as ReviewSeverity) || 'info';

    // Extract message
    const messageMatch = findingContent.match(/<message>([\s\S]*?)<\/message>/);
    const message = messageMatch?.[1]?.trim() || 'No message provided';

    // Extract optional location
    const locationMatch = findingContent.match(/<location>([\s\S]*?)<\/location>/);
    const location = locationMatch?.[1]?.trim();

    // Extract optional suggestion
    const suggestionMatch = findingContent.match(/<suggestion>([\s\S]*?)<\/suggestion>/);
    const suggestion = suggestionMatch?.[1]?.trim();

    findings.push({
      reviewer,
      severity,
      message,
      location,
      suggestion,
      timestamp,
    });
  }

  return findings;
}

/**
 * Fallback heuristic checks when LLM call fails
 */
function runHeuristicChecks(content: string): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const timestamp = new Date().toISOString();

  logger.info('Running fallback heuristic checks...');

  // Check for code examples
  if (content.includes('```') && content.includes('function')) {
    findings.push({
      reviewer: 'TechnicalReviewer',
      severity: 'info',
      message: 'Code examples found and reviewed',
      timestamp,
    });
  }

  // Check for API references without URLs
  if (content.toLowerCase().includes('api') && !content.includes('http')) {
    findings.push({
      reviewer: 'TechnicalReviewer',
      severity: 'warning',
      message: 'API references found but no URLs provided',
      suggestion: 'Include full API endpoint URLs for clarity',
      timestamp,
    });
  }

  // Check for performance claims without benchmarks
  if (
    content.match(/\b(performance|speed|faster|optimized)\b/i) &&
    !content.includes('benchmark')
  ) {
    findings.push({
      reviewer: 'TechnicalReviewer',
      severity: 'warning',
      message: 'Performance claims should be backed by benchmarks or data',
      suggestion: 'Add benchmark results or comparative data',
      timestamp,
    });
  }

  return findings;
}

/**
 * TechnicalReviewer node
 * Checks code examples compile, API references are accurate, technical claims are supported.
 * Uses LLM via compilePrompt + BaseChatModel with heuristic fallback.
 */
export async function technicalReviewerNode(
  state: ReviewWorkerState
): Promise<Partial<ReviewWorkerState>> {
  const { content, model, langfuseClient, traceId } = state;
  let findings: ReviewFinding[] = [];

  // If no model available, fall back to heuristics
  if (!model) {
    logger.warn('No LLM model available, using heuristic checks only');
    findings = runHeuristicChecks(content);
    return { findings };
  }

  try {
    logger.info('Starting LLM-based technical review...');

    // Build the prompt using compilePrompt (loads from prompts/technical-reviewer.md)
    const compiled = await compilePrompt({
      name: 'technical-reviewer',
      variables: {
        content,
        technical_domain: 'Software Development',
        target_audience: 'Technical practitioners and developers',
        focus_areas: [
          'Code accuracy and correctness',
          'Technical clarity',
          'Best practices compliance',
          'Working examples verification',
        ].join('\n- '),
        requirements: [
          'All code examples must be syntactically correct',
          'Technical claims must be verifiable',
          'Examples should follow current best practices',
        ].join('\n- '),
      },
      langfuseClient,
    });

    // Create Langfuse generation trace if available
    const generationStartTime = new Date();
    let generationId: string | undefined;

    if (langfuseClient?.isAvailable() && traceId) {
      generationId = `gen-tech-review-${Date.now()}`;
      langfuseClient.createGeneration({
        traceId,
        id: generationId,
        name: 'technical-review',
        model: 'technical-reviewer-model',
        input: compiled.prompt,
        metadata: {
          contentLength: content.length,
          reviewType: 'technical',
          promptSource: compiled.source,
        },
        startTime: generationStartTime,
      });
    }

    // Invoke model directly (follows section-writer pattern)
    const response = await model.invoke([{ role: 'user', content: compiled.prompt }]);

    // Extract content from response
    let responseText = '';
    if (typeof response.content === 'string') {
      responseText = response.content;
    } else if (Array.isArray(response.content)) {
      responseText = response.content
        .map((c: unknown) => {
          if (typeof c === 'string') return c;
          if (c && typeof c === 'object' && 'text' in c) return (c as { text: string }).text;
          return '';
        })
        .join('');
    }

    // Update Langfuse trace
    if (langfuseClient?.isAvailable() && traceId && generationId) {
      langfuseClient.createGeneration({
        traceId,
        id: generationId,
        name: 'technical-review',
        model: 'technical-reviewer-model',
        input: compiled.prompt,
        output: responseText,
        metadata: {
          contentLength: content.length,
          reviewType: 'technical',
          success: true,
        },
        startTime: generationStartTime,
        endTime: new Date(),
      });
      await langfuseClient.flush();
    }

    logger.debug('LLM response received, parsing XML...');

    // Parse XML findings from LLM response
    findings = parseXmlFindings(responseText, 'TechnicalReviewer');

    logger.info(`Review complete, found ${findings.length} finding(s)`);

    // If no findings were parsed, fall back to heuristics
    if (findings.length === 0) {
      logger.warn('No findings parsed from LLM response, using heuristics');
      findings = runHeuristicChecks(content);
    }
  } catch (error) {
    logger.error('LLM review failed, falling back to heuristics:', error);
    findings = runHeuristicChecks(content);
  }

  return { findings };
}

/**
 * StyleReviewer node
 * Checks tone consistency, readability, and audience appropriateness
 */
export async function styleReviewerNode(
  state: ReviewWorkerState
): Promise<Partial<ReviewWorkerState>> {
  const { content } = state;
  const findings: ReviewFinding[] = [];

  // Check for overly long sentences
  const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const longSentences = sentences.filter((s) => s.split(' ').length > 30);

  if (longSentences.length > 0) {
    findings.push({
      reviewer: 'StyleReviewer',
      severity: 'warning',
      message: `Found ${longSentences.length} sentence(s) longer than 30 words`,
      suggestion: 'Break up long sentences for better readability',
      timestamp: new Date().toISOString(),
    });
  }

  // Check for passive voice indicators
  const passiveIndicators = ['is being', 'was being', 'has been', 'had been', 'will be'];
  const hasPassiveVoice = passiveIndicators.some((indicator) =>
    content.toLowerCase().includes(indicator)
  );

  if (hasPassiveVoice) {
    findings.push({
      reviewer: 'StyleReviewer',
      severity: 'info',
      message: 'Passive voice detected in content',
      suggestion: 'Consider using active voice for clearer, more direct writing',
      timestamp: new Date().toISOString(),
    });
  }

  // Check for consistent heading structure
  const headings = content.match(/^#{1,6}\s+.+$/gm) || [];
  if (headings.length > 0) {
    findings.push({
      reviewer: 'StyleReviewer',
      severity: 'info',
      message: `Document structure includes ${headings.length} heading(s)`,
      timestamp: new Date().toISOString(),
    });
  }

  // Check tone appropriateness
  const informalWords = ['gonna', 'wanna', 'kinda', 'sorta', 'yeah', 'nah'];
  const hasInformalLanguage = informalWords.some((word) => content.toLowerCase().includes(word));

  if (hasInformalLanguage) {
    findings.push({
      reviewer: 'StyleReviewer',
      severity: 'warning',
      message: 'Informal language detected',
      suggestion: 'Use formal language for professional documentation',
      timestamp: new Date().toISOString(),
    });
  }

  return { findings };
}

/**
 * FactChecker node
 * Cross-references claims against research findings
 */
export async function factCheckerNode(
  state: ReviewWorkerState
): Promise<Partial<ReviewWorkerState>> {
  const { content, researchFindings } = state;
  const findings: ReviewFinding[] = [];

  // Check for unsupported claims
  const claimIndicators = [
    'research shows',
    'studies indicate',
    'data suggests',
    'according to',
    'proven',
  ];
  const hasClaims = claimIndicators.some((indicator) => content.toLowerCase().includes(indicator));

  if (hasClaims && !content.includes('[') && !content.includes('http')) {
    findings.push({
      reviewer: 'FactChecker',
      severity: 'error',
      message: 'Claims found without citations or references',
      suggestion: 'Add citations or reference links for factual claims',
      timestamp: new Date().toISOString(),
    });
  }

  // Check if research findings are available for cross-reference
  if (researchFindings) {
    findings.push({
      reviewer: 'FactChecker',
      severity: 'info',
      message: 'Cross-referenced content against research findings',
      timestamp: new Date().toISOString(),
    });

    // Check for consistency with research
    const researchKeywords = researchFindings.toLowerCase().split(/\s+/);
    const contentKeywords = content.toLowerCase().split(/\s+/);
    const overlap = researchKeywords.filter((kw) => contentKeywords.includes(kw));

    if (overlap.length < 10) {
      findings.push({
        reviewer: 'FactChecker',
        severity: 'warning',
        message: 'Limited overlap with research findings',
        suggestion: 'Ensure content aligns with research data',
        timestamp: new Date().toISOString(),
      });
    }
  } else {
    findings.push({
      reviewer: 'FactChecker',
      severity: 'info',
      message: 'No research findings provided for cross-reference',
      timestamp: new Date().toISOString(),
    });
  }

  // Check for numerical claims without sources
  const numericalClaims = content.match(/\b\d+(\.\d+)?%?\b/g);
  if (numericalClaims && numericalClaims.length > 3) {
    const hasSources = content.includes('source:') || content.includes('Source:');
    if (!hasSources) {
      findings.push({
        reviewer: 'FactChecker',
        severity: 'warning',
        message: 'Multiple numerical claims found without clear sources',
        suggestion: 'Provide sources for statistical data',
        timestamp: new Date().toISOString(),
      });
    }
  }

  return { findings };
}
