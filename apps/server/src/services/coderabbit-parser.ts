/**
 * CodeRabbit Parser Service
 *
 * Parses CodeRabbit PR review comments and extracts structured feedback.
 * Handles CodeRabbit's markdown format and converts it into actionable data.
 */

import { createLogger } from '@automaker/utils';
import type {
  CodeRabbitReview,
  CodeRabbitFileComment,
  CodeRabbitSummary,
  CodeRabbitSeverity,
  CodeRabbitCategory,
  CodeRabbitParseOptions,
} from '@automaker/types';

const logger = createLogger('CodeRabbitParser');

/**
 * Severity keywords that indicate issue severity
 */
const SEVERITY_KEYWORDS: Record<string, CodeRabbitSeverity> = {
  critical: 'critical',
  security: 'critical',
  vulnerability: 'critical',
  error: 'critical',
  warning: 'warning',
  warn: 'warning',
  issue: 'warning',
  suggestion: 'suggestion',
  consider: 'suggestion',
  recommend: 'suggestion',
  info: 'info',
  note: 'info',
  tip: 'info',
};

/**
 * Category keywords for classifying comments
 */
const CATEGORY_KEYWORDS: Record<string, CodeRabbitCategory> = {
  security: 'security',
  vulnerability: 'security',
  performance: 'performance',
  optimization: 'performance',
  maintainability: 'maintainability',
  maintenance: 'maintainability',
  refactor: 'maintainability',
  style: 'style',
  formatting: 'style',
  'best practice': 'best-practice',
  'best-practice': 'best-practice',
  'more specific type': 'best-practice',
  'instead of': 'best-practice',
  'recommended': 'best-practice',
  bug: 'bug',
  defect: 'bug',
  documentation: 'documentation',
  docs: 'documentation',
  comment: 'documentation',
  testing: 'testing',
  test: 'testing',
};

/**
 * Service for parsing CodeRabbit review feedback
 */
export class CodeRabbitParserService {
  /**
   * Parse CodeRabbit review markdown content
   */
  parseReview(markdown: string, options: CodeRabbitParseOptions = {}): CodeRabbitReview {
    logger.info('Parsing CodeRabbit review content');

    const summary = this.extractSummary(markdown);
    const comments = this.extractComments(markdown);

    // Apply filters if specified
    let filteredComments = comments;

    if (options.actionableOnly) {
      filteredComments = filteredComments.filter((c) => c.actionable);
    }

    if (options.minSeverity) {
      const severityOrder: CodeRabbitSeverity[] = ['info', 'suggestion', 'warning', 'critical'];
      const minIndex = severityOrder.indexOf(options.minSeverity);
      filteredComments = filteredComments.filter((c) => {
        const commentIndex = severityOrder.indexOf(c.severity);
        return commentIndex >= minIndex;
      });
    }

    if (options.categories && options.categories.length > 0) {
      filteredComments = filteredComments.filter((c) => options.categories!.includes(c.category));
    }

    logger.info(
      `Parsed ${filteredComments.length} comments (${comments.length - filteredComments.length} filtered out)`
    );

    return {
      summary,
      comments: filteredComments,
      rawContent: markdown,
      parsedAt: new Date().toISOString(),
    };
  }

  /**
   * Extract summary statistics from markdown
   */
  private extractSummary(markdown: string): CodeRabbitSummary {
    const summary: CodeRabbitSummary = {
      filesReviewed: 0,
      linesChanged: 0,
      criticalCount: 0,
      warningCount: 0,
      suggestionCount: 0,
    };

    // Look for summary section
    const summaryMatch = markdown.match(/##\s*Summary\s*([\s\S]*?)(?=##|$)/i);
    if (summaryMatch) {
      const summaryText = summaryMatch[1];

      // Extract file count
      const filesMatch = summaryText.match(/(\d+)\s*files?\s*reviewed/i);
      if (filesMatch) {
        summary.filesReviewed = parseInt(filesMatch[1], 10);
      }

      // Extract lines changed
      const linesMatch = summaryText.match(/(\d+)\s*lines?\s*changed/i);
      if (linesMatch) {
        summary.linesChanged = parseInt(linesMatch[1], 10);
      }

      // Extract issue counts
      const criticalMatch = summaryText.match(/(\d+)\s*critical/i);
      if (criticalMatch) {
        summary.criticalCount = parseInt(criticalMatch[1], 10);
      }

      const warningMatch = summaryText.match(/(\d+)\s*warnings?/i);
      if (warningMatch) {
        summary.warningCount = parseInt(warningMatch[1], 10);
      }

      const suggestionMatch = summaryText.match(/(\d+)\s*suggestions?/i);
      if (suggestionMatch) {
        summary.suggestionCount = parseInt(suggestionMatch[1], 10);
      }

      // Extract overall assessment
      const assessmentMatch = summaryText.match(/Overall[:\s]+(.+?)(?:\n|$)/i);
      if (assessmentMatch) {
        summary.overallAssessment = assessmentMatch[1].trim();
      }
    }

    return summary;
  }

  /**
   * Extract file-level comments from markdown
   */
  private extractComments(markdown: string): CodeRabbitFileComment[] {
    const comments: CodeRabbitFileComment[] = [];

    // Split by file sections (typically "### File: path/to/file.ts")
    const fileSections = markdown.split(/###\s*(?:File:|📄)\s*/i);

    for (let i = 1; i < fileSections.length; i++) {
      const section = fileSections[i];
      const fileComments = this.parseFileSection(section);
      comments.push(...fileComments);
    }

    // If no file sections found, try parsing as a flat list
    if (comments.length === 0) {
      const flatComments = this.parseFlatComments(markdown);
      comments.push(...flatComments);
    }

    return comments;
  }

  /**
   * Parse comments from a file section
   */
  private parseFileSection(section: string): CodeRabbitFileComment[] {
    const comments: CodeRabbitFileComment[] = [];

    // Extract file path (first line)
    const lines = section.split('\n');
    const filePath = lines[0].trim().replace(/`/g, '');

    // Look for comment blocks (typically separated by line breaks or markers)
    const commentBlocks = this.splitCommentBlocks(section);

    for (const block of commentBlocks) {
      const comment = this.parseCommentBlock(block, filePath);
      if (comment) {
        comments.push(comment);
      }
    }

    return comments;
  }

  /**
   * Parse a single comment block
   */
  private parseCommentBlock(block: string, filePath: string): CodeRabbitFileComment | null {
    // Skip empty blocks or headers
    if (!block.trim() || block.trim().length < 10) {
      return null;
    }

    // Extract line number/range
    let lineNumber: number | undefined;
    let lineRange: { start: number; end: number } | undefined;

    const lineMatch = block.match(/(?:####\s*)?(?:line|L)\s*(\d+)(?:\s*[-–]\s*(\d+))?/i);
    if (lineMatch) {
      const start = parseInt(lineMatch[1], 10);
      const end = lineMatch[2] ? parseInt(lineMatch[2], 10) : undefined;

      if (end) {
        lineRange = { start, end };
      } else {
        lineNumber = start;
      }
    }

    // Extract code blocks
    const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/g;
    const codeBlocks: string[] = [];
    let match;

    while ((match = codeBlockRegex.exec(block)) !== null) {
      codeBlocks.push(match[1].trim());
    }

    const originalCode = codeBlocks[0];
    const suggestedCode = codeBlocks[1];

    // Extract comment text (everything outside code blocks)
    let commentText = block.replace(/```[\w]*\n[\s\S]*?```/g, '');
    // Remove line numbers
    commentText = commentText.replace(/(?:line|L)\s*\d+(?:\s*-\s*\d+)?/gi, '');
    commentText = commentText.trim();

    // Determine severity
    const severity = this.detectSeverity(commentText);

    // Determine category
    const category = this.detectCategory(commentText);

    // Determine if actionable
    const actionable = this.isActionable(commentText, suggestedCode);

    return {
      filePath,
      lineNumber,
      lineRange,
      originalCode,
      suggestedCode,
      comment: commentText,
      severity,
      category,
      actionable,
    };
  }

  /**
   * Split section into individual comment blocks
   */
  private splitCommentBlocks(section: string): string[] {
    // Split by markdown headings (####) or horizontal rules
    const blocks: string[] = [];
    const lines = section.split('\n');
    let currentBlock: string[] = [];
    let firstLine = true;

    for (const line of lines) {
      // Skip the file path line (first line in section)
      if (firstLine) {
        firstLine = false;
        continue;
      }

      // New block starts with level 4 heading or list marker
      if (line.match(/^#{4}\s+/) || line.match(/^[-*]\s+/)) {
        if (currentBlock.length > 0) {
          blocks.push(currentBlock.join('\n'));
          currentBlock = [];
        }
      }
      currentBlock.push(line);
    }

    if (currentBlock.length > 0) {
      blocks.push(currentBlock.join('\n'));
    }

    return blocks.filter((b) => b.trim().length > 0);
  }

  /**
   * Parse comments from flat markdown (no file sections)
   */
  private parseFlatComments(markdown: string): CodeRabbitFileComment[] {
    const comments: CodeRabbitFileComment[] = [];
    const blocks = this.splitCommentBlocks(markdown);

    for (const block of blocks) {
      // Try to extract file path from the block itself
      const fileMatch = block.match(/(?:file|path):\s*`?([^\s`]+)`?/i);
      const filePath = fileMatch ? fileMatch[1] : 'unknown';

      const comment = this.parseCommentBlock(block, filePath);
      if (comment) {
        comments.push(comment);
      }
    }

    return comments;
  }

  /**
   * Detect severity level from comment text
   */
  private detectSeverity(text: string): CodeRabbitSeverity {
    const lowerText = text.toLowerCase();

    for (const [keyword, severity] of Object.entries(SEVERITY_KEYWORDS)) {
      if (lowerText.includes(keyword)) {
        return severity;
      }
    }

    // Default to suggestion
    return 'suggestion';
  }

  /**
   * Detect category from comment text
   */
  private detectCategory(text: string): CodeRabbitCategory {
    const lowerText = text.toLowerCase();

    for (const [keyword, category] of Object.entries(CATEGORY_KEYWORDS)) {
      if (lowerText.includes(keyword)) {
        return category;
      }
    }

    // Default to other
    return 'other';
  }

  /**
   * Determine if a comment is actionable (requires code change)
   */
  private isActionable(text: string, suggestedCode?: string): boolean {
    // If there's suggested code, it's actionable
    if (suggestedCode) {
      return true;
    }

    const lowerText = text.toLowerCase();

    // Actionable keywords
    const actionableKeywords = [
      'should',
      'must',
      'need to',
      'replace',
      'change',
      'fix',
      'update',
      'add',
      'remove',
      'refactor',
      'improve',
    ];

    // Non-actionable keywords
    const nonActionableKeywords = ['note', 'fyi', 'info', 'just noting'];

    // Check for non-actionable first
    for (const keyword of nonActionableKeywords) {
      if (lowerText.includes(keyword)) {
        return false;
      }
    }

    // Check for actionable
    for (const keyword of actionableKeywords) {
      if (lowerText.includes(keyword)) {
        return true;
      }
    }

    // Default to actionable for warnings and critical
    return false;
  }

  /**
   * Get a summary of actionable items
   */
  getActionableSummary(review: CodeRabbitReview): string {
    const actionable = review.comments.filter((c) => c.actionable);

    if (actionable.length === 0) {
      return 'No actionable items found.';
    }

    const lines: string[] = [
      `Found ${actionable.length} actionable items:`,
      '',
    ];

    // Group by severity
    const critical = actionable.filter((c) => c.severity === 'critical');
    const warnings = actionable.filter((c) => c.severity === 'warning');
    const suggestions = actionable.filter((c) => c.severity === 'suggestion');

    if (critical.length > 0) {
      lines.push(`Critical (${critical.length}):`);
      for (const item of critical) {
        lines.push(`  - ${item.filePath}:${item.lineNumber ?? '?'} - ${item.comment.substring(0, 80)}...`);
      }
      lines.push('');
    }

    if (warnings.length > 0) {
      lines.push(`Warnings (${warnings.length}):`);
      for (const item of warnings) {
        lines.push(`  - ${item.filePath}:${item.lineNumber ?? '?'} - ${item.comment.substring(0, 80)}...`);
      }
      lines.push('');
    }

    if (suggestions.length > 0) {
      lines.push(`Suggestions (${suggestions.length}):`);
      for (const item of suggestions.slice(0, 5)) {
        lines.push(`  - ${item.filePath}:${item.lineNumber ?? '?'} - ${item.comment.substring(0, 80)}...`);
      }
      if (suggestions.length > 5) {
        lines.push(`  ... and ${suggestions.length - 5} more`);
      }
    }

    return lines.join('\n');
  }
}

// Singleton instance
let parserInstance: CodeRabbitParserService | null = null;

/**
 * Get the singleton CodeRabbitParserService instance
 */
export function getCodeRabbitParserService(): CodeRabbitParserService {
  if (!parserInstance) {
    parserInstance = new CodeRabbitParserService();
  }
  return parserInstance;
}
