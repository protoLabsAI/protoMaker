/**
 * Review Worker Nodes
 *
 * Three specialized reviewers that execute in parallel:
 * 1. TechnicalReviewer - validates code examples and technical accuracy
 * 2. StyleReviewer - checks tone, readability, and audience fit
 * 3. FactChecker - verifies claims against research findings
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { RunnableConfig } from '@langchain/core/runnables';
import { createLogger } from '@protolabs-ai/utils';
import { LangfuseClient } from '@protolabs-ai/observability';
import { isLangfuseReady } from '../langfuse-guard.js';
import { compilePrompt } from '../prompt-loader.js';
import { extractAllTags, extractTag, extractRequiredEnum } from '../xml-parser.js';
import { copilotkitEmitState, emitHeartbeat } from '../copilotkit-utils.js';

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
  config?: RunnableConfig;
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
 * Parse 8-dimension scoring rubric from LLM response
 */
interface DimensionScore {
  dimension: string;
  score: number;
  evidence: string;
  suggestion: string;
}

interface ScoringResult {
  dimensions: DimensionScore[];
  totalScore: number;
  maxScore: number;
  percentage: number;
  verdict: 'PASS' | 'REVISE' | 'FAIL';
  autoFailReasons: string[];
}

function parseScoring(responseText: string): ScoringResult {
  const dimensions: DimensionScore[] = [];
  const autoFailReasons: string[] = [];

  // Extract dimension scores using regex
  const dimensionRegex =
    /<dimension>\s*<name>(.*?)<\/name>\s*<score>(\d+)<\/score>\s*<evidence>([\s\S]*?)<\/evidence>\s*<suggestion>([\s\S]*?)<\/suggestion>\s*<\/dimension>/g;
  let match;

  while ((match = dimensionRegex.exec(responseText)) !== null) {
    const dimension = match[1].trim();
    const score = parseInt(match[2], 10);
    const evidence = match[3].trim();
    const suggestion = match[4].trim();

    dimensions.push({ dimension, score, evidence, suggestion });

    // Check auto-fail conditions
    if (dimension.toLowerCase().includes('headline') && score < 4) {
      autoFailReasons.push(`Headline score ${score}/10 is below threshold (must be ≥4)`);
    }
    if (dimension.toLowerCase().includes('hook') && score < 4) {
      autoFailReasons.push(`Hook score ${score}/10 is below threshold (must be ≥4)`);
    }
    if (dimension.toLowerCase().includes('scannability') && score < 5) {
      autoFailReasons.push(`Scannability score ${score}/10 is below threshold (must be ≥5)`);
    }
  }

  // Calculate total score and percentage
  const totalScore = dimensions.reduce((sum, d) => sum + d.score, 0);
  const maxScore = dimensions.length * 10;
  const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

  // Determine verdict based on percentage and auto-fail conditions
  let verdict: 'PASS' | 'REVISE' | 'FAIL';
  if (autoFailReasons.length > 0 || percentage < 50) {
    verdict = 'FAIL';
  } else if (percentage < 75) {
    verdict = 'REVISE';
  } else {
    verdict = 'PASS';
  }

  return {
    dimensions,
    totalScore,
    maxScore,
    percentage,
    verdict,
    autoFailReasons,
  };
}

/**
 * Fallback heuristic checks when LLM call fails (TechnicalReviewer)
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
 * Fallback heuristic checks when LLM call fails (StyleReviewer)
 */
function runStyleHeuristicChecks(content: string): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const timestamp = new Date().toISOString();

  logger.info('Running fallback style heuristic checks...');

  // Check for overly long sentences
  const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const longSentences = sentences.filter((s) => s.split(' ').length > 30);

  if (longSentences.length > 0) {
    findings.push({
      reviewer: 'StyleReviewer',
      severity: 'warning',
      message: `Found ${longSentences.length} sentence(s) longer than 30 words`,
      suggestion: 'Break up long sentences for better readability',
      timestamp,
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
      timestamp,
    });
  }

  // Check for consistent heading structure
  const headings = content.match(/^#{1,6}\s+.+$/gm) || [];
  if (headings.length > 0) {
    findings.push({
      reviewer: 'StyleReviewer',
      severity: 'info',
      message: `Document structure includes ${headings.length} heading(s)`,
      timestamp,
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
      timestamp,
    });
  }

  return findings;
}

/**
 * Fallback heuristic checks when LLM call fails (FactChecker)
 */
function runFactHeuristicChecks(content: string, researchFindings?: string): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const timestamp = new Date().toISOString();

  logger.info('Running fallback fact-check heuristic checks...');

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
      timestamp,
    });
  }

  // Check if research findings are available for cross-reference
  if (researchFindings) {
    findings.push({
      reviewer: 'FactChecker',
      severity: 'info',
      message: 'Cross-referenced content against research findings',
      timestamp,
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
        timestamp,
      });
    }
  } else {
    findings.push({
      reviewer: 'FactChecker',
      severity: 'info',
      message: 'No research findings provided for cross-reference',
      timestamp,
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
        timestamp,
      });
    }
  }

  return findings;
}

/**
 * Parse findings from XML using xml-parser utilities
 */
function parseFactFindings(xmlOutput: string): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const timestamp = new Date().toISOString();

  try {
    const findingBlocks = extractAllTags(xmlOutput, 'finding');

    for (const block of findingBlocks) {
      try {
        const severity = extractRequiredEnum(block, 'severity', ['error', 'warning', 'info']);
        const message = extractTag(block, 'message');
        const location = extractTag(block, 'location');
        const suggestion = extractTag(block, 'suggestion');

        if (!message) {
          logger.warn('Skipping FactChecker finding with missing message');
          continue;
        }

        findings.push({
          reviewer: 'FactChecker',
          severity,
          message,
          location,
          suggestion,
          timestamp,
        });
      } catch (error) {
        logger.warn(
          'Failed to parse individual FactChecker finding:',
          error instanceof Error ? error.message : String(error)
        );
      }
    }
  } catch (error) {
    logger.warn(
      'Failed to parse FactChecker findings XML:',
      error instanceof Error ? error.message : String(error)
    );
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
  const { content, model, langfuseClient, traceId, config } = state;
  let findings: ReviewFinding[] = [];

  // Emit state to CopilotKit
  if (config) {
    await copilotkitEmitState(config, {
      currentActivity: 'Running technical review',
      progress: 0,
    });
  }

  // If no model available, fall back to heuristics
  if (!model) {
    logger.warn('No LLM model available, using heuristic checks only');
    findings = runHeuristicChecks(content);
    return { findings };
  }

  try {
    logger.info('Starting LLM-based technical review...');

    // Emit heartbeat
    if (config) {
      await emitHeartbeat(config, 'Invoking LLM for technical review');
    }

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

    if (isLangfuseReady(langfuseClient) && traceId) {
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
    if (isLangfuseReady(langfuseClient) && traceId && generationId) {
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

    // Emit completion state
    if (config) {
      await copilotkitEmitState(config, {
        currentActivity: 'Technical review complete',
        progress: 100,
      });
    }
  } catch (error) {
    logger.error('LLM review failed, falling back to heuristics:', error);
    findings = runHeuristicChecks(content);
  }

  return { findings };
}

/**
 * StyleReviewer node
 * Checks tone consistency, readability, and audience appropriateness using 8-dimension antagonistic scoring
 */
export async function styleReviewerNode(
  state: ReviewWorkerState
): Promise<Partial<ReviewWorkerState>> {
  const { content, model, langfuseClient, traceId, config } = state;
  let findings: ReviewFinding[] = [];

  // Emit state to CopilotKit
  if (config) {
    await copilotkitEmitState(config, {
      currentActivity: 'Running style review',
      progress: 0,
    });
  }

  // If no model available, fall back to heuristics
  if (!model) {
    logger.warn('No LLM model available for StyleReviewer, using heuristic checks only');
    findings = runStyleHeuristicChecks(content);
    return { findings };
  }

  try {
    logger.info('Starting LLM-based style review with 8-dimension scoring...');

    // Emit heartbeat
    if (config) {
      await emitHeartbeat(config, 'Invoking LLM for style review');
    }

    // Build the prompt using compilePrompt (loads from prompts/style-reviewer.md)
    const compiled = await compilePrompt({
      name: 'style-reviewer',
      variables: {
        content,
        content_type: 'blog-post',
        blog_template: 'tutorial',
        revenue_goal: 'medium',
        target_length: content.split(/\s+/).length,
        seo_keywords: 'N/A',
        internal_links: 'N/A',
      },
      langfuseClient,
    });

    // Create Langfuse generation trace if available
    const generationStartTime = new Date();
    let generationId: string | undefined;

    if (isLangfuseReady(langfuseClient) && traceId) {
      generationId = `gen-style-review-${Date.now()}`;
      langfuseClient.createGeneration({
        traceId,
        id: generationId,
        name: 'style-review',
        model: 'style-reviewer-model',
        input: compiled.prompt,
        metadata: {
          contentLength: content.length,
          reviewType: 'style',
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
    if (isLangfuseReady(langfuseClient) && traceId && generationId) {
      langfuseClient.createGeneration({
        traceId,
        id: generationId,
        name: 'style-review',
        model: 'style-reviewer-model',
        input: compiled.prompt,
        output: responseText,
        metadata: {
          contentLength: content.length,
          reviewType: 'style',
          success: true,
        },
        startTime: generationStartTime,
        endTime: new Date(),
      });
      await langfuseClient.flush();
    }

    logger.debug('LLM response received, parsing scoring rubric...');

    // Parse 8-dimension scoring from response
    const scoringResult = parseScoring(responseText);

    logger.info(
      `Style review complete: ${scoringResult.verdict} (${scoringResult.percentage.toFixed(1)}%, ${scoringResult.totalScore}/${scoringResult.maxScore})`
    );

    // Convert scoring dimensions to findings
    findings = scoringResult.dimensions.map((dim) => {
      let severity: ReviewSeverity = 'info';
      if (dim.score < 5) {
        severity = 'error';
      } else if (dim.score < 7) {
        severity = 'warning';
      }

      return {
        reviewer: 'StyleReviewer',
        severity,
        message: `${dim.dimension}: ${dim.score}/10 - ${dim.evidence}`,
        suggestion: dim.suggestion,
        timestamp: new Date().toISOString(),
      };
    });

    // Add verdict as a finding
    const verdictMessage = `Overall verdict: ${scoringResult.verdict} (${scoringResult.percentage.toFixed(1)}%, ${scoringResult.totalScore}/${scoringResult.maxScore})`;
    findings.push({
      reviewer: 'StyleReviewer',
      severity:
        scoringResult.verdict === 'FAIL'
          ? 'error'
          : scoringResult.verdict === 'REVISE'
            ? 'warning'
            : 'info',
      message: verdictMessage,
      timestamp: new Date().toISOString(),
    });

    // Add auto-fail reasons if present
    if (scoringResult.autoFailReasons.length > 0) {
      findings.push({
        reviewer: 'StyleReviewer',
        severity: 'error',
        message: `Auto-fail conditions triggered: ${scoringResult.autoFailReasons.join('; ')}`,
        suggestion: 'Address critical dimensions before proceeding',
        timestamp: new Date().toISOString(),
      });
    }

    // If no dimensions were parsed, fall back to heuristics
    if (scoringResult.dimensions.length === 0) {
      logger.warn('No scoring dimensions parsed from LLM response, using heuristics');
      findings = runStyleHeuristicChecks(content);
    }

    // Emit completion state
    if (config) {
      await copilotkitEmitState(config, {
        currentActivity: 'Style review complete',
        progress: 100,
      });
    }
  } catch (error) {
    logger.error('Error during LLM-based style review, falling back to heuristics', error);
    findings = runStyleHeuristicChecks(content);
  }

  return { findings };
}

/**
 * FactChecker node
 * Cross-references claims against research findings using LLM with xml-parser utilities
 */
export async function factCheckerNode(
  state: ReviewWorkerState
): Promise<Partial<ReviewWorkerState>> {
  const { content, researchFindings, model, langfuseClient, traceId, config } = state;
  let findings: ReviewFinding[] = [];

  // Emit state to CopilotKit
  if (config) {
    await copilotkitEmitState(config, {
      currentActivity: 'Running fact check',
      progress: 0,
    });
  }

  // If no model available, fall back to heuristics
  if (!model) {
    logger.warn('No LLM model available for FactChecker, using heuristic checks only');
    findings = runFactHeuristicChecks(content, researchFindings);
    return { findings };
  }

  try {
    logger.info('Starting LLM-based fact checking...');

    // Emit heartbeat
    if (config) {
      await emitHeartbeat(config, 'Invoking LLM for fact checking');
    }

    // Build the prompt using compilePrompt (loads from prompts/fact-checker.md)
    const compiled = await compilePrompt({
      name: 'fact-checker',
      variables: {
        content,
        domain: 'technical documentation',
        standards: 'high accuracy, proper citations, verified claims',
        sources: researchFindings || 'No research findings provided',
        critical_claims: 'All factual and statistical claims',
      },
      langfuseClient,
    });

    // Create Langfuse generation trace if available
    const generationStartTime = new Date();
    let generationId: string | undefined;

    if (isLangfuseReady(langfuseClient) && traceId) {
      generationId = `gen-fact-check-${Date.now()}`;
      langfuseClient.createGeneration({
        traceId,
        id: generationId,
        name: 'fact-check',
        model: 'fact-checker-model',
        input: compiled.prompt,
        metadata: {
          contentLength: content.length,
          reviewType: 'fact-check',
          hasResearchFindings: !!researchFindings,
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
    if (isLangfuseReady(langfuseClient) && traceId && generationId) {
      langfuseClient.createGeneration({
        traceId,
        id: generationId,
        name: 'fact-check',
        model: 'fact-checker-model',
        input: compiled.prompt,
        output: responseText,
        metadata: {
          contentLength: content.length,
          reviewType: 'fact-check',
          success: true,
        },
        startTime: generationStartTime,
        endTime: new Date(),
      });
      await langfuseClient.flush();
    }

    logger.debug('LLM response received, parsing XML findings...');

    // Parse XML findings using xml-parser utilities
    findings = parseFactFindings(responseText);

    logger.info(`Fact check complete, found ${findings.length} finding(s)`);

    // If no findings were parsed, fall back to heuristics
    if (findings.length === 0) {
      logger.warn('No findings parsed from LLM response, using heuristics');
      findings = runFactHeuristicChecks(content, researchFindings);
    }

    // Emit completion state
    if (config) {
      await copilotkitEmitState(config, {
        currentActivity: 'Fact check complete',
        progress: 100,
      });
    }
  } catch (error) {
    logger.error('LLM fact checking failed, falling back to heuristics:', error);
    findings = runFactHeuristicChecks(content, researchFindings);
  }

  return { findings };
}
