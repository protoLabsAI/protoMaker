/**
 * Review Worker Nodes
 *
 * Three specialized reviewers that execute in parallel:
 * 1. TechnicalReviewer - validates code examples and technical accuracy
 * 2. StyleReviewer - checks tone, readability, and audience fit
 * 3. FactChecker - verifies claims against research findings
 */

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
}

/**
 * TechnicalReviewer node
 * Checks code examples compile, API references are accurate, technical claims are supported
 */
export async function technicalReviewerNode(
  state: ReviewWorkerState
): Promise<Partial<ReviewWorkerState>> {
  const { content } = state;
  const findings: ReviewFinding[] = [];

  // Simulate technical review checks
  // In real implementation, this would:
  // - Extract code blocks and validate syntax
  // - Check API references against documentation
  // - Verify technical claims

  // Example checks
  if (content.includes('```') && content.includes('function')) {
    // Mock: Check if code examples are present
    findings.push({
      reviewer: 'TechnicalReviewer',
      severity: 'info',
      message: 'Code examples found and reviewed',
      timestamp: new Date().toISOString(),
    });
  }

  if (content.toLowerCase().includes('api') && !content.includes('http')) {
    findings.push({
      reviewer: 'TechnicalReviewer',
      severity: 'warning',
      message: 'API references found but no URLs provided',
      suggestion: 'Include full API endpoint URLs for clarity',
      timestamp: new Date().toISOString(),
    });
  }

  // Check for technical claims without examples
  if (
    content.match(/\b(performance|speed|faster|optimized)\b/i) &&
    !content.includes('benchmark')
  ) {
    findings.push({
      reviewer: 'TechnicalReviewer',
      severity: 'warning',
      message: 'Performance claims should be backed by benchmarks or data',
      suggestion: 'Add benchmark results or comparative data',
      timestamp: new Date().toISOString(),
    });
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

  // Simulate style review checks
  // In real implementation, this would:
  // - Check reading level
  // - Verify tone consistency
  // - Validate audience appropriateness

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
  const hasInformalLanguage = informalWords.some((word) =>
    content.toLowerCase().includes(word)
  );

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

  // Simulate fact checking
  // In real implementation, this would:
  // - Extract factual claims
  // - Cross-reference with research data
  // - Verify citations and sources

  // Check for unsupported claims
  const claimIndicators = [
    'research shows',
    'studies indicate',
    'data suggests',
    'according to',
    'proven',
  ];
  const hasClaims = claimIndicators.some((indicator) =>
    content.toLowerCase().includes(indicator)
  );

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
