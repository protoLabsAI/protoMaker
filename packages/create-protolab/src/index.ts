/**
 * create-protolab
 *
 * Scan any repo, compare against the ProtoLabs gold standard,
 * and scaffold the full automation stack.
 */

// Phase functions
export { researchRepo } from './phases/research.js';
export { analyzeGaps } from './phases/analyze.js';
export { generateProposal } from './phases/propose.js';
export { init } from './phases/init.js';
export { setupCI } from './phases/ci.js';
export { initializeBeads } from './phases/beads.js';
export { createBranchProtectionRuleset } from './phases/branch-protection.js';
export { generateCodeRabbitConfig } from './phases/coderabbit.js';
export { executeDiscordPhase } from './phases/discord.js';

// Types
export type { RepoResearchResult, GapAnalysisReport, AlignmentProposal } from './types.js';
export type { InitOptions, InitResult } from './phases/init.js';
export type { CIOptions, CIResult } from './phases/ci.js';
