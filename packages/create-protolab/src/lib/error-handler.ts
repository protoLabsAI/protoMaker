/**
 * Error Handler for create-protolab CLI
 * Provides graceful degradation, clear error messages, and recovery suggestions
 */

export enum ErrorCategory {
  FATAL = 'FATAL',
  RECOVERABLE = 'RECOVERABLE',
  WARNING = 'WARNING',
}

export enum ErrorCode {
  // FATAL - Cannot continue
  NOT_GIT_REPO = 'NOT_GIT_REPO',
  NO_PACKAGE_JSON = 'NO_PACKAGE_JSON',
  NO_WRITE_ACCESS = 'NO_WRITE_ACCESS',
  INVALID_PROJECT_PATH = 'INVALID_PROJECT_PATH',

  // RECOVERABLE - Can skip and continue
  GH_CLI_MISSING = 'GH_CLI_MISSING',
  BD_CLI_MISSING = 'BD_CLI_MISSING',
  DISCORD_API_DOWN = 'DISCORD_API_DOWN',
  GITHUB_API_RATE_LIMIT = 'GITHUB_API_RATE_LIMIT',
  CI_SETUP_FAILED = 'CI_SETUP_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  AUTOMAKER_SERVER_DOWN = 'AUTOMAKER_SERVER_DOWN',

  // WARNING - Non-critical
  ALREADY_INITIALIZED = 'ALREADY_INITIALIZED',
  CONFIG_EXISTS = 'CONFIG_EXISTS',
  PARTIAL_SETUP = 'PARTIAL_SETUP',
}

export interface ProtolabError {
  code: ErrorCode;
  category: ErrorCategory;
  message: string;
  recovery?: string;
  technicalDetails?: string;
  canContinue: boolean;
}

export class ProtolabCliError extends Error {
  public readonly code: ErrorCode;
  public readonly category: ErrorCategory;
  public readonly recovery?: string;
  public readonly technicalDetails?: string;
  public readonly canContinue: boolean;

  constructor(error: ProtolabError) {
    super(error.message);
    this.name = 'ProtolabCliError';
    this.code = error.code;
    this.category = error.category;
    this.recovery = error.recovery;
    this.technicalDetails = error.technicalDetails;
    this.canContinue = error.canContinue;
  }

  public toString(): string {
    let output = `[${this.category}] ${this.message}`;

    if (this.recovery) {
      output += `\n\n💡 Recovery: ${this.recovery}`;
    }

    if (this.technicalDetails) {
      output += `\n\n🔍 Technical Details: ${this.technicalDetails}`;
    }

    return output;
  }
}

/**
 * Error definitions with recovery suggestions
 */
export const ERROR_DEFINITIONS: Record<ErrorCode, Omit<ProtolabError, 'code'>> = {
  // FATAL ERRORS
  [ErrorCode.NOT_GIT_REPO]: {
    category: ErrorCategory.FATAL,
    message: 'Not a git repository',
    recovery: 'Run "git init" first to initialize a git repository',
    canContinue: false,
  },

  [ErrorCode.NO_PACKAGE_JSON]: {
    category: ErrorCategory.FATAL,
    message: 'No package.json found',
    recovery: 'Is this a Node.js project? Run "npm init" to create a package.json',
    canContinue: false,
  },

  [ErrorCode.NO_WRITE_ACCESS]: {
    category: ErrorCategory.FATAL,
    message: 'No write access to project directory',
    recovery: 'Check file permissions and ensure you have write access',
    canContinue: false,
  },

  [ErrorCode.INVALID_PROJECT_PATH]: {
    category: ErrorCategory.FATAL,
    message: 'Invalid project path',
    recovery: 'Provide a valid directory path to initialize',
    canContinue: false,
  },

  // RECOVERABLE ERRORS
  [ErrorCode.GH_CLI_MISSING]: {
    category: ErrorCategory.RECOVERABLE,
    message: 'GitHub CLI (gh) not found',
    recovery: 'Install with: brew install gh (macOS) or visit https://cli.github.com',
    canContinue: true,
  },

  [ErrorCode.BD_CLI_MISSING]: {
    category: ErrorCategory.RECOVERABLE,
    message: 'Beads CLI (bd) not found',
    recovery: 'Install from: https://github.com/jlowin/beads',
    canContinue: true,
  },

  [ErrorCode.DISCORD_API_DOWN]: {
    category: ErrorCategory.RECOVERABLE,
    message: 'Discord API is unavailable',
    recovery: 'Continuing without Discord integration. You can configure it later.',
    canContinue: true,
  },

  [ErrorCode.GITHUB_API_RATE_LIMIT]: {
    category: ErrorCategory.RECOVERABLE,
    message: 'GitHub API rate limit exceeded',
    recovery: 'Wait a few minutes or authenticate with "gh auth login" for higher limits',
    canContinue: true,
  },

  [ErrorCode.CI_SETUP_FAILED]: {
    category: ErrorCategory.RECOVERABLE,
    message: 'CI/CD setup failed',
    recovery: 'You can set up CI/CD manually later or run the setup script again',
    canContinue: true,
  },

  [ErrorCode.NETWORK_ERROR]: {
    category: ErrorCategory.RECOVERABLE,
    message: 'Network connection error',
    recovery: 'Check your internet connection and try again',
    canContinue: true,
  },

  [ErrorCode.AUTOMAKER_SERVER_DOWN]: {
    category: ErrorCategory.RECOVERABLE,
    message: 'Automaker server is not running',
    recovery: 'Start the server with "npm run dev" in the automaker directory',
    canContinue: true,
  },

  // WARNINGS
  [ErrorCode.ALREADY_INITIALIZED]: {
    category: ErrorCategory.WARNING,
    message: 'ProtoLab already initialized in this project',
    recovery: 'Use --force to reinitialize or skip this step',
    canContinue: true,
  },

  [ErrorCode.CONFIG_EXISTS]: {
    category: ErrorCategory.WARNING,
    message: 'Configuration file already exists',
    recovery: 'Skipping file creation to avoid overwriting existing configuration',
    canContinue: true,
  },

  [ErrorCode.PARTIAL_SETUP]: {
    category: ErrorCategory.WARNING,
    message: 'Partial setup detected from previous run',
    recovery: 'Continuing from where the previous setup left off',
    canContinue: true,
  },
};

/**
 * Create a ProtolabCliError from an ErrorCode
 */
export function createError(code: ErrorCode, technicalDetails?: string): ProtolabCliError {
  const definition = ERROR_DEFINITIONS[code];
  return new ProtolabCliError({
    code,
    ...definition,
    technicalDetails,
  });
}

/**
 * Check if an error is fatal
 */
export function isFatalError(error: ProtolabCliError): boolean {
  return error.category === ErrorCategory.FATAL;
}

/**
 * Check if an error is recoverable
 */
export function isRecoverableError(error: ProtolabCliError): boolean {
  return error.category === ErrorCategory.RECOVERABLE;
}

/**
 * Check if an error is a warning
 */
export function isWarning(error: ProtolabCliError): boolean {
  return error.category === ErrorCategory.WARNING;
}

/**
 * Format error for console output with colors
 */
export function formatError(error: ProtolabCliError): string {
  const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
  };

  let color = colors.red;
  let icon = '✗';

  if (error.category === ErrorCategory.WARNING) {
    color = colors.yellow;
    icon = '⚠';
  } else if (error.category === ErrorCategory.RECOVERABLE) {
    color = colors.yellow;
    icon = '⚠';
  }

  let output = `${color}${icon} [${error.category}] ${error.message}${colors.reset}`;

  if (error.recovery) {
    output += `\n  ${colors.cyan}💡 ${error.recovery}${colors.reset}`;
  }

  if (error.technicalDetails) {
    output += `\n  ${colors.blue}🔍 ${error.technicalDetails}${colors.reset}`;
  }

  return output;
}

/**
 * Handle error based on its category
 * Returns true if execution should continue, false if it should stop
 */
export function handleError(
  error: ProtolabCliError,
  options: { verbose?: boolean; skipPrompts?: boolean } = {}
): boolean {
  console.error('\n' + formatError(error) + '\n');

  // Fatal errors always stop execution
  if (isFatalError(error)) {
    return false;
  }

  // Warnings always continue
  if (isWarning(error)) {
    return true;
  }

  // Recoverable errors can continue
  if (isRecoverableError(error) && error.canContinue) {
    if (options.verbose) {
      console.log('  ℹ Continuing with remaining setup phases...\n');
    }
    return true;
  }

  return false;
}

/**
 * Wrap an async operation with error handling
 */
export async function tryOperation<T>(
  operation: () => Promise<T>,
  errorCode: ErrorCode,
  options: { verbose?: boolean; optional?: boolean } = {}
): Promise<{ success: boolean; data?: T; error?: ProtolabCliError }> {
  try {
    const data = await operation();
    return { success: true, data };
  } catch (err) {
    const technicalDetails = err instanceof Error ? err.message : String(err);
    const error = createError(errorCode, technicalDetails);

    if (!options.optional && isFatalError(error)) {
      throw error;
    }

    return { success: false, error };
  }
}
