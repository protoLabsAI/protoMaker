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
  ScaffoldOptions,
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

// Starter kit context files (write to .automaker/CONTEXT.md in new projects)
export {
  getDocsStarterContext,
  getPortfolioStarterContext,
  getAiAgentAppStarterContext,
} from './starters.js';

// Starter kit scaffolding (copies Astro projects with name/config substitution)
export {
  scaffoldDocsStarter,
  scaffoldPortfolioStarter,
  scaffoldLandingPageStarter,
  scaffoldGeneralStarter,
  scaffoldAiAgentAppStarter,
} from './scaffold.js';
export type { ScaffoldResult } from './scaffold.js';

// Design tokens
export { getDesignTokensCss, getDesignTokensThemeBlock, designTokens } from './design-tokens.js';
export type { DesignTokens } from './design-tokens.js';

// Astro component string templates (for project scaffolding — write to disk)
export {
  getNavComponent,
  getNavMobileMenuComponent,
  getFooterComponent,
  getSEOComponent,
  getButtonComponent,
  getBadgeComponent,
  getCardComponent,
  getAstroComponents,
} from './components.js';

// Shared component prop interfaces (for typed usage in consuming Astro projects)
// Astro components are imported directly: import Nav from '@protolabsai/templates/components/Nav.astro'
export type {
  NavLink,
  FooterLink,
  FooterColumn,
  SocialPlatform,
  SocialLink,
  ButtonVariant,
  ButtonSize,
  BadgeColor,
  CardGlow,
} from './components/index.js';
