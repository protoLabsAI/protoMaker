/**
 * @protolabsai/templates
 *
 * Shared template content for protoLabs starter kits and project scaffolding.
 * Pure data package — no file I/O, no async. Exports functions that return strings and objects.
 */

// Types
export type {
  StarterKitType,
  CodingRulesType,
  StarterFeature,
  ProjectTemplate,
  DefaultSettings,
  ClaudeMdOptions,
  WelcomeNoteOptions,
} from './types.js';

// Projects
export {
  getBugsProject,
  getSystemImprovementsProject,
  getAllPersistentProjects,
} from './projects.js';

// Features
export { getStarterFeatures, getUniversalFeatures } from './features.js';

// Welcome note
export { getWelcomeNote } from './welcome-note.js';

// Settings
export { getDefaultSettings, getDefaultCategories } from './settings.js';

// CLAUDE.md fragments
export {
  getBaseClaudeMd,
  getGitWorkflowSection,
  getAgentGuidelinesSection,
  getDocsCommandsSection,
  getExtensionCommandsSection,
} from './claude-md.js';

// Coding rules
export { getCodingRules } from './coding-rules.js';

// CI templates
export { getDocsCI, getExtensionCI } from './ci.js';
