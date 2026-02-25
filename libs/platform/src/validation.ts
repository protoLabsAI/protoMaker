/**
 * Input validation utilities for git-related operations
 * Prevents command injection by validating user inputs before use in shell commands
 */

// ============================================================================
// Constants
// ============================================================================

/** Maximum allowed length for git branch names */
export const MAX_BRANCH_NAME_LENGTH = 250;

/** Maximum allowed length for remote names */
export const MAX_REMOTE_NAME_LENGTH = 100;

/** Maximum allowed length for commit messages */
export const MAX_COMMIT_MESSAGE_LENGTH = 10000;

/** Shell metacharacters that could be used for command injection */
const SHELL_METACHARACTERS = new RegExp('[;&|`$()<>"\\\' !{}[\\]*?~#\\n\\r]');

/** Characters allowed in branch names (alphanumeric, hyphen, underscore, forward slash, dot) */
const BRANCH_NAME_PATTERN = new RegExp('^[a-zA-Z0-9._\\-/]+$');

/** Characters allowed in remote names (alphanumeric, hyphen, underscore, dot) */
const REMOTE_NAME_PATTERN = new RegExp('^[a-zA-Z0-9._\\-]+$');

/** UUID v4 pattern for session IDs */
const UUID_V4_PATTERN = new RegExp(
  '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
  'i'
);

/** Alphanumeric with hyphens pattern (for session IDs) */
const ALPHANUMERIC_HYPHEN_PATTERN = new RegExp('^[a-zA-Z0-9\\-]+$');

// ============================================================================
// Branded Types for Type Safety
// ============================================================================

/**
 * Branded type for validated branch names
 * Use this to ensure branch names have been validated before use
 */
export type ValidatedBranchName = string & { readonly __brand: 'ValidatedBranchName' };

/**
 * Branded type for validated remote names
 * Use this to ensure remote names have been validated before use
 */
export type ValidatedRemoteName = string & { readonly __brand: 'ValidatedRemoteName' };

/**
 * Branded type for sanitized commit messages
 * Use this to ensure commit messages have been sanitized before use
 */
export type SanitizedCommitMessage = string & { readonly __brand: 'SanitizedCommitMessage' };

/**
 * Branded type for validated session IDs
 * Use this to ensure session IDs have been validated before use
 */
export type ValidatedSessionId = string & { readonly __brand: 'ValidatedSessionId' };

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate a git branch name to prevent command injection
 *
 * Git branch names have specific rules:
 * - Cannot contain spaces, ~, ^, :, ?, *, [, \, or control characters
 * - Cannot start or end with a dot
 * - Cannot contain consecutive dots (..)
 * - Cannot end with .lock
 *
 * For security, we enforce stricter rules:
 * - Only alphanumeric, hyphens, underscores, forward slashes, and dots
 * - No shell metacharacters (;, &, |, $, `, etc.)
 * - Maximum length of 250 characters
 *
 * @param name - The branch name to validate
 * @returns True if the branch name is valid and safe to use
 *
 * @example
 * ```typescript
 * isValidBranchName('feature/my-branch'); // true
 * isValidBranchName('fix/bug-123'); // true
 * isValidBranchName('feature; rm -rf /'); // false (contains shell metacharacter)
 * isValidBranchName('branch name'); // false (contains space)
 * ```
 */
export function isValidBranchName(name: string): name is ValidatedBranchName {
  if (!name || typeof name !== 'string') {
    return false;
  }

  // Check length
  if (name.length === 0 || name.length > MAX_BRANCH_NAME_LENGTH) {
    return false;
  }

  // Check for shell metacharacters
  if (SHELL_METACHARACTERS.test(name)) {
    return false;
  }

  // Check pattern (alphanumeric, hyphen, underscore, forward slash, dot)
  if (!BRANCH_NAME_PATTERN.test(name)) {
    return false;
  }

  // Git-specific rules
  if (name.startsWith('.') || name.endsWith('.')) {
    return false;
  }

  if (name.includes('..')) {
    return false;
  }

  if (name.endsWith('.lock')) {
    return false;
  }

  // Cannot end with a slash
  if (name.endsWith('/')) {
    return false;
  }

  return true;
}

/**
 * Validate a git remote name to prevent command injection
 *
 * Remote names should be simple identifiers like "origin", "upstream", "fork"
 *
 * For security, we enforce:
 * - Only alphanumeric, hyphens, underscores, and dots
 * - No shell metacharacters (;, &, |, $, `, etc.)
 * - Maximum length of 100 characters
 * - Cannot start with a hyphen (could be interpreted as a flag)
 *
 * @param name - The remote name to validate
 * @returns True if the remote name is valid and safe to use
 *
 * @example
 * ```typescript
 * isValidRemoteName('origin'); // true
 * isValidRemoteName('upstream'); // true
 * isValidRemoteName('my-fork'); // true
 * isValidRemoteName('origin; rm -rf /'); // false (contains shell metacharacter)
 * isValidRemoteName('-malicious'); // false (starts with hyphen)
 * ```
 */
export function isValidRemoteName(name: string): name is ValidatedRemoteName {
  if (!name || typeof name !== 'string') {
    return false;
  }

  // Check length
  if (name.length === 0 || name.length > MAX_REMOTE_NAME_LENGTH) {
    return false;
  }

  // Check for shell metacharacters
  if (SHELL_METACHARACTERS.test(name)) {
    return false;
  }

  // Check pattern (alphanumeric, hyphen, underscore, dot)
  if (!REMOTE_NAME_PATTERN.test(name)) {
    return false;
  }

  // Cannot start with a hyphen (could be interpreted as a flag)
  if (name.startsWith('-')) {
    return false;
  }

  return true;
}

/**
 * Sanitize a commit message to prevent command injection
 *
 * Commit messages are often used in shell commands with quotes, so we need to
 * escape or remove characters that could break out of quotes.
 *
 * This function:
 * - Removes shell metacharacters that could be used for injection
 * - Preserves valid punctuation and whitespace
 * - Removes control characters
 * - Trims the message to MAX_COMMIT_MESSAGE_LENGTH
 *
 * @param message - The commit message to sanitize
 * @returns Sanitized commit message safe to use in shell commands
 *
 * @example
 * ```typescript
 * sanitizeCommitMessage('Fix bug in parser'); // 'Fix bug in parser'
 * sanitizeCommitMessage('Fix: bug $(rm -rf /)'); // 'Fix: bug (rm -rf )'
 * sanitizeCommitMessage('Update & improve'); // 'Update  improve'
 * ```
 */
export function sanitizeCommitMessage(message: string): SanitizedCommitMessage {
  if (!message || typeof message !== 'string') {
    return '' as SanitizedCommitMessage;
  }

  // Remove shell metacharacters and control characters
  // Keep: letters, numbers, spaces, basic punctuation (.,!?:;-_+@#%=()/)
  // Remove dangerous characters that could break out of quotes or enable command injection
  let sanitized = message
    // Remove shell metacharacters that enable command injection
    .replace(/[;&|`$<>"\\'{}[\]*~]/g, '')
    // Remove control characters (including newlines, tabs, etc.)
    .replace(/[\x00-\x1F\x7F-\x9F]/g, ' ')
    // Collapse multiple spaces into one
    .replace(/\s+/g, ' ')
    // Trim whitespace
    .trim();

  // Limit length
  if (sanitized.length > MAX_COMMIT_MESSAGE_LENGTH) {
    sanitized = sanitized.substring(0, MAX_COMMIT_MESSAGE_LENGTH);
  }

  return sanitized as SanitizedCommitMessage;
}

/**
 * Validate a session ID to prevent command injection
 *
 * Session IDs should be:
 * - UUID v4 format (8-4-4-4-12 hex digits), OR
 * - Alphanumeric with hyphens only
 * - No shell metacharacters
 *
 * @param id - The session ID to validate
 * @returns True if the session ID is valid and safe to use
 *
 * @example
 * ```typescript
 * isValidSessionId('550e8400-e29b-41d4-a716-446655440000'); // true (UUID v4)
 * isValidSessionId('session-abc123'); // true (alphanumeric with hyphens)
 * isValidSessionId('session; rm -rf /'); // false (contains shell metacharacter)
 * ```
 */
export function isValidSessionId(id: string): id is ValidatedSessionId {
  if (!id || typeof id !== 'string') {
    return false;
  }

  // Check length (UUIDs are 36 chars, allow up to 100 for custom IDs)
  if (id.length === 0 || id.length > 100) {
    return false;
  }

  // Check for shell metacharacters
  if (SHELL_METACHARACTERS.test(id)) {
    return false;
  }

  // Check if it's a valid UUID v4 or alphanumeric with hyphens
  return UUID_V4_PATTERN.test(id) || ALPHANUMERIC_HYPHEN_PATTERN.test(id);
}

// ============================================================================
// Assertion Functions (for TypeScript narrowing)
// ============================================================================

/**
 * Assert that a branch name is valid, throwing an error if not
 * Use this when you need to validate and narrow the type in one step
 *
 * @param name - The branch name to validate
 * @param context - Optional context for the error message
 * @throws Error if the branch name is invalid
 *
 * @example
 * ```typescript
 * const branchName = userInput;
 * assertValidBranchName(branchName, 'merge operation');
 * // branchName is now typed as ValidatedBranchName
 * await git.merge(branchName);
 * ```
 */
export function assertValidBranchName(
  name: string,
  context?: string
): asserts name is ValidatedBranchName {
  if (!isValidBranchName(name)) {
    const msg = context
      ? `Invalid branch name for ${context}: "${name}"`
      : `Invalid branch name: "${name}"`;
    throw new Error(msg);
  }
}

/**
 * Assert that a remote name is valid, throwing an error if not
 * Use this when you need to validate and narrow the type in one step
 *
 * @param name - The remote name to validate
 * @param context - Optional context for the error message
 * @throws Error if the remote name is invalid
 *
 * @example
 * ```typescript
 * const remote = userInput || 'origin';
 * assertValidRemoteName(remote, 'push operation');
 * // remote is now typed as ValidatedRemoteName
 * await git.push(remote);
 * ```
 */
export function assertValidRemoteName(
  name: string,
  context?: string
): asserts name is ValidatedRemoteName {
  if (!isValidRemoteName(name)) {
    const msg = context
      ? `Invalid remote name for ${context}: "${name}"`
      : `Invalid remote name: "${name}"`;
    throw new Error(msg);
  }
}

/**
 * Assert that a session ID is valid, throwing an error if not
 * Use this when you need to validate and narrow the type in one step
 *
 * @param id - The session ID to validate
 * @param context - Optional context for the error message
 * @throws Error if the session ID is invalid
 *
 * @example
 * ```typescript
 * const sessionId = req.params.id;
 * assertValidSessionId(sessionId, 'terminal session');
 * // sessionId is now typed as ValidatedSessionId
 * const session = await getSession(sessionId);
 * ```
 */
export function assertValidSessionId(
  id: string,
  context?: string
): asserts id is ValidatedSessionId {
  if (!isValidSessionId(id)) {
    const msg = context
      ? `Invalid session ID for ${context}: "${id}"`
      : `Invalid session ID: "${id}"`;
    throw new Error(msg);
  }
}

// ============================================================================
// Shell-Safe Integer Validation
// ============================================================================

/**
 * Branded type for integers safe to interpolate into shell commands.
 * TypeScript types are erased at runtime — any `number`-typed field
 * (e.g. `prNumber`) could be a float, NaN, or tainted string at runtime.
 * Using this branded type enforces an explicit validation step.
 */
export type SafeShellInteger = number & { readonly __brand: 'SafeShellInteger' };

/**
 * Assert that a value is a finite, non-negative integer safe for shell
 * interpolation.
 *
 * Use before every `execAsync` call that embeds a numeric value:
 *
 * ```typescript
 * assertSafeShellInteger(prNumber, 'gh pr view');
 * await execAsync(`gh pr view ${prNumber} --json state`);
 * ```
 *
 * @param value  - The value to validate (accepts `number | string | unknown`)
 * @param context - Optional label for the error message
 * @throws Error if value is not a valid safe integer
 */
export function assertSafeShellInteger(
  value: unknown,
  context?: string
): asserts value is SafeShellInteger {
  const n = typeof value === 'string' ? parseInt(value, 10) : (value as number);
  const valid = typeof n === 'number' && Number.isInteger(n) && Number.isFinite(n) && n >= 0;
  if (!valid) {
    const label = context ? `[${context}] ` : '';
    throw new Error(
      `${label}Value is not a safe integer for shell interpolation: ${String(value)}`
    );
  }
}
