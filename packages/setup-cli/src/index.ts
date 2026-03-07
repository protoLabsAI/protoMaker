/**
 * @protolabsai/setup
 *
 * Standalone CLI that scans a repo, generates proto.config.yaml,
 * scaffolds .automaker/ structure, and produces an HTML gap analysis report.
 * Runs without a server or API key.
 */

// Re-export core services from create-protolab
export { researchRepo } from 'create-protolab';
export { analyzeGaps } from 'create-protolab';
export { init } from 'create-protolab';
export type { RepoResearchResult, GapAnalysisReport } from 'create-protolab';

// Local services
export { writeProtoConfig } from './services/proto-config-writer.js';
export { generateHtmlReport } from './services/report-generator.js';
export type { ProtoConfig } from './services/proto-config-writer.js';
export type { HtmlReportOptions } from './services/report-generator.js';
