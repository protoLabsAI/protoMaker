/**
 * @protolabsai/utils
 * Shared utility functions for AutoMaker
 */

// Error handling
export {
  isAbortError,
  isCancellationError,
  isAuthenticationError,
  isRateLimitError,
  isQuotaExhaustedError,
  isFetchError,
  extractRetryAfter,
  classifyError,
  getUserFriendlyErrorMessage,
  getErrorMessage,
} from './error-handler.js';

// Conversation utilities
export {
  extractTextFromContent,
  normalizeContentBlocks,
  formatHistoryAsText,
  convertHistoryToMessages,
} from './conversation-utils.js';

// Image handling
export {
  getMimeTypeForImage,
  readImageAsBase64,
  convertImagesToContentBlocks,
  formatImagePathsForPrompt,
} from './image-handler.js';

// Prompt building
export {
  buildPromptWithImages,
  type PromptContent,
  type PromptWithImages,
} from './prompt-builder.js';

// Logger
export {
  createLogger,
  getLogLevel,
  setLogLevel,
  setColorsEnabled,
  setTimestampsEnabled,
  registerLogTransport,
  clearLogTransports,
  LogLevel,
  type Logger,
  type LogTransport,
} from './logger.js';

// File system utilities
export { mkdirSafe, existsSafe } from './fs-utils.js';

// Atomic file operations
export {
  atomicWriteJson,
  readJsonFile,
  updateJsonAtomically,
  readJsonWithRecovery,
  rotateBackups,
  logRecoveryWarning,
  DEFAULT_BACKUP_COUNT,
  type AtomicWriteOptions,
  type ReadJsonRecoveryResult,
  type ReadJsonRecoveryOptions,
} from './atomic-writer.js';

// Path utilities
export { normalizePath, pathsEqual } from './path-utils.js';

// Context file loading
export {
  loadContextFiles,
  getContextFilesSummary,
  type ContextMetadata,
  type ContextDomain,
  type ContextRole,
  type ContextFileInfo,
  type ContextFilesResult,
  type ContextFsModule,
  type LoadContextFilesOptions,
  type MemoryFileInfo,
  type TaskContext,
  shouldIncludeContextFile,
} from './context-loader.js';

// Memory loading
export {
  loadRelevantMemory,
  initializeMemoryFolder,
  appendLearning,
  recordMemoryUsage,
  getMemoryDir,
  parseFrontmatter,
  serializeFrontmatter,
  extractTerms,
  calculateUsageScore,
  countMatches,
  incrementUsageStat,
  formatLearning,
  type MemoryFsModule,
  type MemoryMetadata,
  type MemoryFile,
  type MemoryLoadResult,
  type UsageStats,
  type LearningEntry,
  type SimpleMemoryFile,
  type DedupChecker,
  type IndexRebuilder,
} from './memory-loader.js';

// String utilities
export {
  truncate,
  toKebabCase,
  toCamelCase,
  toPascalCase,
  capitalize,
  collapseWhitespace,
  isBlank,
  isNotBlank,
  safeParseInt,
  slugify,
  escapeRegex,
  pluralize,
  formatCount,
} from './string-utils.js';

// Project orchestration parsers
export {
  parseProjectFile,
  generateProjectFile,
  parseMilestoneFile,
  generateMilestoneFile,
  parsePhaseFile,
  generatePhaseFile,
  parsePrdFile,
  generatePrdFile,
  parseResearchFile,
  phaseToFeatureDescription,
  resolveMilestoneDependencies,
  resolvePhaseDependencies,
} from './project-parser.js';

// Project utilities
export {
  createProject,
  phaseToBranchName,
  generateProjectMarkdown,
  generateMilestoneMarkdown,
  generatePhaseMarkdown,
} from './project-utils.js';

// Skills loading
export {
  getSkillsDir,
  parseSkillFrontmatter,
  serializeSkill,
  checkRequirements,
  listSkills,
  getSkill,
  loadRelevantSkills,
  createSkill,
  updateSkill,
  deleteSkill,
  recordSkillUsage,
  initializeSkillsFolder,
  type SkillsFsModule,
  type SkillsLoadResult,
} from './skills-loader.js';

// Memory chunking
export { chunkMarkdownFile, type MemoryChunk } from './memory-chunker.js';

// Work intake (pull-based phase claiming pure functions)
export {
  roleMatchesPhase,
  phaseDepsAreSatisfied,
  getClaimablePhases,
  holdsClaim,
  isReclaimable,
  materializeFeature,
  phasePriority,
  type MaterializedFeature,
} from './work-intake.js';

// Sanitization utilities
export {
  normalizeUnicode,
  sanitizeMarkdownForLLM,
  detectPromptInjection,
  validateFilePaths,
  type SanitizationViolation,
  type SanitizationResult,
  type SanitizationSeverity,
} from './sanitize.js';

// Time formatting utilities
export { formatDuration, formatTimestamp, formatElapsed } from './format-time.js';
