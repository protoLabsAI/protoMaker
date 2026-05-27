/**
 * protomaker context
 *
 * Context file management commands — list, get, create, delete.
 *
 * Usage:
 *   protomaker context list [options]
 *   protomaker context get <filename> [options]
 *   protomaker context create <filename> [options]
 *   protomaker context delete <filename> [options]
 */

import { Command } from 'commander';
import { ApiClient } from './api-client.js';
import { output, error, usageError, type GlobalFlags, getOutputMode } from './output.js';
import { resolveApiConfig } from './config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContextFile {
  name: string;
  size: number;
}

interface ListResponse {
  success: boolean;
  files?: ContextFile[];
  error?: string;
}

interface GetResponse {
  success: boolean;
  content?: string;
  error?: string;
}

interface CreateResponse {
  success: boolean;
  error?: string;
}

interface DeleteResponse {
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract global flags from Commander opts.
 */
function getGlobalFlags(opts: Record<string, unknown>): GlobalFlags {
  return {
    json: opts.json === true,
    quiet: opts.quiet === true,
    project: (opts.project as string) ?? process.cwd(),
  };
}

/**
 * Create an API client from global flags.
 */
function createClient(flags: GlobalFlags): ApiClient {
  const config = resolveApiConfig(flags.project);
  return new ApiClient(config);
}

/**
 * Validate filename for context files.
 */
function validateFilename(filename: string): void {
  if (!filename || !filename.match(/\.(md|txt)$/)) {
    usageError(`Invalid filename "${filename}". Context files must end in .md or .txt`);
  }
}

/**
 * Format file size for display.
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Render context file list as a human-readable table.
 */
function renderFileList(files: ContextFile[]): string {
  if (files.length === 0) {
    return 'No context files found.';
  }

  const lines: string[] = [];
  lines.push('');
  lines.push(`Context files (${files.length}):`);
  lines.push('');

  for (const f of files) {
    lines.push(`  ${f.name.padEnd(40)} ${formatSize(f.size)}`);
  }

  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * protomaker context list
 *
 * List all context files in the project.
 */
export function listCommand(parent: Command): void {
  const cmd = new Command('list');
  cmd.description('List all context files in the project');

  cmd.action(async (opts) => {
    const flags = getGlobalFlags(cmd.optsWithGlobals());
    const client = createClient(flags);

    const result = await client.post<ListResponse>('/context/list', {
      projectPath: flags.project,
    });

    if (!result.ok) {
      error(result.error || 'Failed to list context files');
      process.exit(1);
      return;
    }

    const files = result.data?.files ?? [];

    if (getOutputMode(flags) === 'json') {
      output(files, flags);
    } else {
      output(renderFileList(files), flags);
    }
  });

  parent.addCommand(cmd);
}

/**
 * protomaker context get <filename>
 *
 * Read and display a context file.
 */
export function getCommand(parent: Command): void {
  const cmd = new Command('get').arguments('<filename>');
  cmd.description('Read a context file');

  cmd.action(async (filename: string, opts) => {
    validateFilename(filename);

    const flags = getGlobalFlags(cmd.optsWithGlobals());
    const client = createClient(flags);

    const result = await client.post<GetResponse>('/context/get', {
      projectPath: flags.project,
      filename,
    });

    if (!result.ok) {
      error(result.error || `Failed to read context file "${filename}"`);
      process.exit(1);
      return;
    }

    const content = result.data?.content;

    if (getOutputMode(flags) === 'json') {
      output({ filename, content }, flags);
    } else {
      output(content ?? '', flags);
    }
  });

  parent.addCommand(cmd);
}

/**
 * protomaker context create <filename>
 *
 * Create a new context file. Reads content from stdin or --content option.
 */
export function createCommand(parent: Command): void {
  const cmd = new Command('create').arguments('<filename>');
  cmd.description('Create a new context file');
  cmd.option('--content <text>', 'Content to write (omit to read from stdin)');

  cmd.action(async (filename: string, opts) => {
    validateFilename(filename);

    let content: string;

    if (opts.content) {
      content = opts.content;
    } else {
      // Read from stdin
      content = await readStdin();
    }

    if (!content) {
      usageError('Content is required. Provide --content or pipe via stdin.');
    }

    const flags = getGlobalFlags(cmd.optsWithGlobals());
    const client = createClient(flags);

    const result = await client.post<CreateResponse>('/context/create', {
      projectPath: flags.project,
      filename,
      content,
    });

    if (!result.ok) {
      error(result.error || `Failed to create context file "${filename}"`);
      process.exit(1);
      return;
    }

    if (getOutputMode(flags) === 'json') {
      output({ success: true, filename }, flags);
    } else {
      output(`Created context file: ${filename}`, flags);
    }
  });

  parent.addCommand(cmd);
}

/**
 * protomaker context delete <filename>
 *
 * Delete a context file.
 */
export function deleteCommand(parent: Command): void {
  const cmd = new Command('delete').arguments('<filename>');
  cmd.description('Delete a context file');
  cmd.option('--yes', 'Skip confirmation prompt');

  cmd.action(async (filename: string, opts) => {
    validateFilename(filename);

    const flags = getGlobalFlags(cmd.optsWithGlobals());
    const client = createClient(flags);

    const result = await client.post<DeleteResponse>('/context/delete', {
      projectPath: flags.project,
      filename,
    });

    if (!result.ok) {
      error(result.error || `Failed to delete context file "${filename}"`);
      process.exit(1);
      return;
    }

    if (getOutputMode(flags) === 'json') {
      output({ success: true, filename }, flags);
    } else {
      output(`Deleted context file: ${filename}`, flags);
    }
  });

  parent.addCommand(cmd);
}

// ---------------------------------------------------------------------------
// Stdin reader
// ---------------------------------------------------------------------------

/**
 * Read all data from stdin as a string.
 */
function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
  });
}
