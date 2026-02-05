/**
 * CodeRabbit Parser Service
 *
 * Parses CodeRabbit review comments from GitHub PR comments and extracts
 * structured feedback that can be linked to features.
 */

import { createLogger } from '@automaker/utils';
import type {
  CodeRabbitComment,
  CodeRabbitReview,
  CodeRabbitParseResult,
  CodeRabbitSeverity,
  GitHubComment,
} from '@automaker/types';

const logger = createLogger('CodeRabbitParser');

/**
 * Patterns to identify CodeRabbit comments
 */
const CODERABBIT_INDICATORS = [
  /^(?:🐰|🔍|💡|⚠️|🚨)/,
  /coderabbit/i,
  /\*\*Severity\*\*:/i,
  /\*\*Category\*\*:/i,
  /\*\*Suggestion\*\*:/i,
];

/**
 * Extract severity from comment text
 */
function extractSeverity(text: string): CodeRabbitSeverity {
  const severityMatch = text.match(/\*\*Severity\*\*:\s*(\w+)/i);
  if (!severityMatch) {
    // Try to infer from emoji
    if (text.includes('🚨')) return 'critical';
    if (text.includes('⚠️')) return 'warning';
    if (text.includes('💡')) return 'suggestion';
    return 'info';
  }

  const severity = severityMatch[1].toLowerCase();
  if (severity === 'critical' || severity === 'high') return 'critical';
  if (severity === 'warning' || severity === 'medium') return 'warning';
  if (severity === 'suggestion' || severity === 'low') return 'suggestion';
  return 'info';
}

/**
 * Extract category from comment text
 */
function extractCategory(text: string): string | undefined {
  const categoryMatch = text.match(/\*\*Category\*\*:\s*([^\n]+)/i);
  return categoryMatch?.[1]?.trim();
}

/**
 * Extract suggestion from comment text
 */
function extractSuggestion(text: string): string | undefined {
  const suggestionMatch = text.match(/\*\*Suggestion\*\*:\s*([^\n]+(?:\n(?!\*\*)[^\n]+)*)/i);
  return suggestionMatch?.[1]?.trim();
}

/**
 * Extract file path and line info from comment context
 */
function extractLocation(text: string): { path?: string; line?: number } | undefined {
  // Try to extract file path from markdown code fence or file references
  const fileMatch = text.match(/(?:File|Path):\s*`([^`]+)`/i) || text.match(/```\w*\n\/\/\s*([^\n]+)/);
  const lineMatch = text.match(/(?:Line|L):\s*(\d+)/i);

  if (fileMatch || lineMatch) {
    return {
      path: fileMatch?.[1],
      line: lineMatch ? parseInt(lineMatch[1], 10) : undefined,
    };
  }

  return undefined;
}

/**
 * Check if a GitHub comment is from CodeRabbit
 */
function isCodeRabbitComment(comment: GitHubComment): boolean {
  const author = comment.author.login.toLowerCase();
  if (author === 'coderabbitai' || author.includes('coderabbit')) {
    return true;
  }

  // Check for CodeRabbit indicators in the comment body
  return CODERABBIT_INDICATORS.some((pattern) => pattern.test(comment.body));
}

/**
 * Parse a single CodeRabbit comment into structured format
 */
function parseCodeRabbitComment(comment: GitHubComment): CodeRabbitComment | null {
  if (!isCodeRabbitComment(comment)) {
    return null;
  }

  const severity = extractSeverity(comment.body);
  const category = extractCategory(comment.body);
  const suggestion = extractSuggestion(comment.body);
  const location = extractLocation(comment.body);

  // Extract the main message (first paragraph or up to first bold header)
  const messageMatch = comment.body.match(/^(.+?)(?:\n\n|\*\*)/s);
  const message = (messageMatch?.[1] || comment.body).trim().replace(/^[🐰🔍💡⚠️🚨]\s*/, '');

  return {
    id: comment.id,
    severity,
    message,
    location: location
      ? {
          path: location.path || '',
          line: location.line,
        }
      : undefined,
    suggestion,
    category,
    createdAt: comment.createdAt,
  };
}

export class CodeRabbitParserService {
  /**
   * Parse GitHub PR comments to extract CodeRabbit reviews
   */
  parseReview(
    prNumber: number,
    prUrl: string,
    comments: GitHubComment[]
  ): CodeRabbitParseResult {
    try {
      logger.debug(`Parsing ${comments.length} comments for PR #${prNumber}`);

      const codeRabbitComments: CodeRabbitComment[] = [];

      for (const comment of comments) {
        const parsed = parseCodeRabbitComment(comment);
        if (parsed) {
          codeRabbitComments.push(parsed);
        }
      }

      if (codeRabbitComments.length === 0) {
        logger.debug(`No CodeRabbit comments found in PR #${prNumber}`);
        return {
          success: false,
          error: 'No CodeRabbit comments found',
        };
      }

      // Find summary comment (typically the first or last comment from CodeRabbit)
      const summaryComment = comments.find(
        (c) => isCodeRabbitComment(c) && c.body.toLowerCase().includes('summary')
      );

      const review: CodeRabbitReview = {
        prNumber,
        prUrl,
        reviewedAt: new Date().toISOString(),
        comments: codeRabbitComments,
        summary: summaryComment?.body,
      };

      logger.info(`Parsed ${codeRabbitComments.length} CodeRabbit comments for PR #${prNumber}`);
      return {
        success: true,
        review,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to parse CodeRabbit review: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Check if any comments in a list are from CodeRabbit
   */
  hasCodeRabbitReview(comments: GitHubComment[]): boolean {
    return comments.some((comment) => isCodeRabbitComment(comment));
  }

  /**
   * Get CodeRabbit comment count from a list of comments
   */
  getCodeRabbitCommentCount(comments: GitHubComment[]): number {
    return comments.filter((comment) => isCodeRabbitComment(comment)).length;
  }
}

// Export singleton instance
export const codeRabbitParserService = new CodeRabbitParserService();
