/**
 * Git exec environment utilities
 *
 * Provides a shared, cross-platform environment object for spawning git/gh
 * child processes, and a helper for extracting a clean title from a feature
 * description.
 */

/**
 * Build an environment object suitable for spawning git and gh CLI processes.
 *
 * Extends the current process environment with platform-specific paths so that
 * `git` and `gh` are resolvable even when the server is started without a full
 * login shell (e.g. on macOS via launchd or inside a Docker container).
 *
 * Sets HUSKY=0 to suppress husky hooks in worktrees — agents handle
 * formatting themselves.
 */
export function createGitExecEnv(): NodeJS.ProcessEnv {
  const pathSeparator = process.platform === 'win32' ? ';' : ':';
  const additionalPaths: string[] = [];

  if (process.platform === 'win32') {
    if (process.env.LOCALAPPDATA) {
      additionalPaths.push(`${process.env.LOCALAPPDATA}\\Programs\\Git\\cmd`);
    }
    if (process.env.PROGRAMFILES) {
      additionalPaths.push(`${process.env.PROGRAMFILES}\\Git\\cmd`);
    }
    if (process.env['ProgramFiles(x86)']) {
      additionalPaths.push(`${process.env['ProgramFiles(x86)']}\\Git\\cmd`);
    }
  } else {
    additionalPaths.push(
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/home/linuxbrew/.linuxbrew/bin',
      `${process.env.HOME}/.local/bin`
    );
  }

  const extendedPath = [process.env.PATH, ...additionalPaths.filter(Boolean)]
    .filter(Boolean)
    .join(pathSeparator);

  return {
    ...process.env,
    PATH: extendedPath,
    HUSKY: '0',
  };
}

/**
 * Extract a clean title from a feature description for use in commit messages
 * and PR titles.
 *
 * Takes the first line of the description, strips common markdown formatting,
 * and truncates to 72 characters.
 */
export function extractTitleFromDescription(description: string): string {
  if (!description || !description.trim()) {
    return 'Untitled Feature';
  }

  // Take first line, remove markdown formatting
  const firstLine = description.split('\n')[0].trim();
  const cleaned = firstLine
    .replace(/^#+\s*/, '') // Remove markdown headers
    .replace(/\*\*/g, '') // Remove bold
    .replace(/\*/g, '') // Remove italic
    .replace(/`/g, '') // Remove code marks
    .trim();

  // Limit length
  if (cleaned.length > 72) {
    return cleaned.substring(0, 69) + '...';
  }
  return cleaned || 'Feature implementation';
}
