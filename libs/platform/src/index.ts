/**
 * @automaker/platform
 * Platform-specific utilities for AutoMaker
 */

// Path utilities
export {
  getAutomakerDir,
  getFeaturesDir,
  getFeatureDir,
  getFeatureImagesDir,
  getBackupsDir,
  getFeatureBackupDir,
  getBoardDir,
  getImagesDir,
  getContextDir,
  getWorktreesDir,
  getValidationsDir,
  getValidationDir,
  getValidationPath,
  getAppSpecPath,
  getBranchTrackingPath,
  getExecutionStatePath,
  getNotificationsPath,
  // Event history paths
  getEventHistoryDir,
  getEventHistoryIndexPath,
  getEventPath,
  ensureEventHistoryDir,
  ensureAutomakerDir,
  getGlobalSettingsPath,
  getCredentialsPath,
  getProjectSettingsPath,
  ensureDataDir,
  // Ideation paths
  getIdeationDir,
  getIdeasDir,
  getIdeaDir,
  getIdeaPath,
  getIdeaAttachmentsDir,
  getIdeationSessionsDir,
  getIdeationSessionPath,
  getIdeationDraftsDir,
  getIdeationAnalysisPath,
  ensureIdeationDir,
  // Ralph loop paths (persistent retry with external verification)
  getRalphDir,
  getRalphStatePath,
  getRalphProgressPath,
  ensureRalphDir,
} from './paths.js';

// Project orchestration paths (from paths.js - unique exports)
export { ensureProjectDir } from './paths.js';

// Project orchestration utilities (from projects.js)
export {
  // Path utilities
  getProjectsDir,
  getProjectDir,
  getProjectFilePath,
  getProjectJsonPath,
  getResearchFilePath,
  getPrdFilePath,
  getMilestonesDir,
  getMilestoneDir,
  getMilestoneFilePath,
  getPhaseFilePath,
  // Slug generation
  generateMilestoneSlug,
  generateProjectSlug,
  generatePhaseSlug,
  // Directory management
  ensureProjectsDir,
  ensureProjectStructure,
  ensureMilestoneDir,
  // Listing
  listProjectPlans,
  listMilestones,
  listPhases,
  // Existence/deletion
  projectPlanExists,
  deleteProjectPlan,
  // Validation
  validateSlugInput,
  InvalidSlugError,
} from './projects.js';

// Subprocess management
export {
  spawnJSONLProcess,
  spawnProcess,
  type SubprocessOptions,
  type SubprocessResult,
} from './subprocess.js';

// Security
export {
  PathNotAllowedError,
  initAllowedPaths,
  isPathAllowed,
  validatePath,
  isPathWithinDirectory,
  getAllowedRootDirectory,
  getDataDirectory,
  getAllowedPaths,
} from './security.js';

// Input validation for git operations
export {
  // Validation functions
  isValidBranchName,
  isValidRemoteName,
  sanitizeCommitMessage,
  isValidSessionId,
  // Assertion functions
  assertValidBranchName,
  assertValidRemoteName,
  assertValidSessionId,
  // Branded types
  type ValidatedBranchName,
  type ValidatedRemoteName,
  type SanitizedCommitMessage,
  type ValidatedSessionId,
  // Constants
  MAX_BRANCH_NAME_LENGTH,
  MAX_REMOTE_NAME_LENGTH,
  MAX_COMMIT_MESSAGE_LENGTH,
} from './validation.js';

// Secure file system (validates paths before I/O operations)
export * as secureFs from './secure-fs.js';
export type { WriteFileOptions, WriteFileSyncOptions, ThrottleConfig } from './secure-fs.js';

// Node.js executable finder (cross-platform)
export {
  findNodeExecutable,
  buildEnhancedPath,
  type NodeFinderResult,
  type NodeFinderOptions,
} from './node-finder.js';

// WSL (Windows Subsystem for Linux) utilities
export {
  isWslAvailable,
  clearWslCache,
  getDefaultWslDistribution,
  getWslDistributions,
  findCliInWsl,
  execInWsl,
  createWslCommand,
  windowsToWslPath,
  wslToWindowsPath,
  type WslCliResult,
  type WslOptions,
} from './wsl.js';

// System paths for tool detection (GitHub CLI, Claude CLI, Node.js, etc.)
export * as systemPaths from './system-paths.js';
export {
  // CLI tool paths
  getGitHubCliPaths,
  getClaudeCliPaths,
  getClaudeConfigDir,
  getClaudeCredentialPaths,
  getClaudeSettingsPath,
  getClaudeStatsCachePath,
  getClaudeProjectsDir,
  getCodexCliPaths,
  getCodexConfigDir,
  getCodexAuthPath,
  getGitBashPaths,
  getOpenCodeCliPaths,
  getOpenCodeConfigDir,
  getOpenCodeAuthPath,
  getShellPaths,
  getExtendedPath,
  // Node.js paths
  getNvmPaths,
  getFnmPaths,
  getNodeSystemPaths,
  getScoopNodePath,
  getChocolateyNodePath,
  getWslVersionPath,
  // System path operations
  systemPathExists,
  systemPathAccess,
  systemPathIsExecutable,
  systemPathReadFile,
  systemPathReadFileSync,
  systemPathWriteFileSync,
  systemPathReaddir,
  systemPathReaddirSync,
  systemPathStatSync,
  systemPathStat,
  isAllowedSystemPath,
  // High-level methods
  findFirstExistingPath,
  findGitHubCliPath,
  findClaudeCliPath,
  getClaudeAuthIndicators,
  type ClaudeAuthIndicators,
  findCodexCliPath,
  getCodexAuthIndicators,
  type CodexAuthIndicators,
  findGitBashPath,
  findOpenCodeCliPath,
  getOpenCodeAuthIndicators,
  type OpenCodeAuthIndicators,
  // Electron userData operations
  setElectronUserDataPath,
  getElectronUserDataPath,
  isElectronUserDataPath,
  electronUserDataReadFileSync,
  electronUserDataWriteFileSync,
  electronUserDataExists,
  // Script directory operations
  setScriptBaseDir,
  getScriptBaseDir,
  scriptDirExists,
  scriptDirMkdirSync,
  scriptDirCreateWriteStream,
  // Electron app bundle operations
  setElectronAppPaths,
  electronAppExists,
  electronAppReadFileSync,
  electronAppStatSync,
  electronAppStat,
  electronAppReadFile,
} from './system-paths.js';

// Port configuration
export { STATIC_PORT, SERVER_PORT, RESERVED_PORTS } from './config/ports.js';

// Editor detection and launching (cross-platform)
export {
  commandExists,
  clearEditorCache,
  detectAllEditors,
  detectDefaultEditor,
  findEditorByCommand,
  openInEditor,
  openInFileManager,
  openInTerminal,
} from './editor.js';

// External terminal detection and launching
export {
  clearTerminalCache,
  detectAllTerminals,
  detectDefaultTerminal,
  findTerminalById,
  openInExternalTerminal,
} from './terminal.js';
