/**
 * Agent prompt barrel export
 *
 * Re-exports all agent prompts — both generic role prompts and personified agent prompts.
 */

// Generic role prompts (used by prompt registry for role-based lookup)
export { getProductManagerPrompt, getResearchPrompt } from './product-manager-prompt.js';
export {
  getEngineeringManagerPrompt,
  getRoleAnalysisPrompt,
} from './engineering-manager-prompt.js';
export { getFrontendEngineerPrompt } from './frontend-engineer-prompt.js';
export { getBackendEngineerPrompt } from './backend-engineer-prompt.js';
export { getDevOpsEngineerPrompt } from './devops-engineer-prompt.js';
export { getQAEngineerPrompt } from './qa-engineer-prompt.js';
export { getDocsEngineerPrompt } from './docs-engineer-prompt.js';
export { getGTMSpecialistPrompt } from './gtm-specialist-prompt.js';

// Personified agent prompts (used by built-in-templates for named agents)
export { getAvaPrompt } from './ava.js';
export { getMattPrompt } from './matt.js';
export { getSamPrompt } from './sam.js';
export { getCindiPrompt } from './cindi.js';
export { getJonPrompt } from './jon.js';
export { getPrMaintainerPrompt } from './pr-maintainer.js';
export { getBoardJanitorPrompt } from './board-janitor.js';
export { getFrankPrompt } from './frank.js';
