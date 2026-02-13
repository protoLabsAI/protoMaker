/**
 * Rollback Handler for create-protolab CLI
 * Cleans up partial changes on failure to ensure idempotency
 */

import * as fs from 'fs';
import * as path from 'path';

export interface RollbackAction {
  type: 'remove_directory' | 'remove_file' | 'restore_file' | 'custom';
  path?: string;
  backupPath?: string;
  description: string;
  execute: () => void | Promise<void>;
}

export class RollbackManager {
  private actions: RollbackAction[] = [];
  private completed: Set<string> = new Set();
  private verbose: boolean;

  constructor(options: { verbose?: boolean } = {}) {
    this.verbose = options.verbose ?? false;
  }

  /**
   * Add a rollback action
   */
  public addAction(action: RollbackAction): void {
    this.actions.push(action);
  }

  /**
   * Mark a phase as completed (won't be rolled back)
   */
  public markCompleted(phase: string): void {
    this.completed.add(phase);
  }

  /**
   * Check if a phase is completed
   */
  public isCompleted(phase: string): boolean {
    return this.completed.has(phase);
  }

  /**
   * Execute all rollback actions in reverse order
   */
  public async rollback(): Promise<void> {
    if (this.actions.length === 0) {
      if (this.verbose) {
        console.log('No rollback actions to perform');
      }
      return;
    }

    console.log('\n⏮  Rolling back partial changes...\n');

    // Execute in reverse order (most recent first)
    for (let i = this.actions.length - 1; i >= 0; i--) {
      const action = this.actions[i];
      try {
        if (this.verbose) {
          console.log(`  • ${action.description}`);
        }
        await action.execute();
      } catch (error) {
        console.error(
          `  ✗ Failed to rollback: ${action.description}`,
          error instanceof Error ? error.message : error
        );
      }
    }

    console.log('\n✓ Rollback completed\n');
  }

  /**
   * Clear all rollback actions (call after successful completion)
   */
  public clear(): void {
    this.actions = [];
  }

  /**
   * Save rollback state to disk for resume capability
   */
  public async saveState(projectPath: string): Promise<void> {
    const stateFile = path.join(projectPath, '.automaker', 'setup-state.json');
    const stateDir = path.dirname(stateFile);

    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }

    const state = {
      completedPhases: Array.from(this.completed),
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf-8');
  }

  /**
   * Load rollback state from disk
   */
  public loadState(projectPath: string): boolean {
    const stateFile = path.join(projectPath, '.automaker', 'setup-state.json');

    if (!fs.existsSync(stateFile)) {
      return false;
    }

    try {
      const content = fs.readFileSync(stateFile, 'utf-8');
      const state = JSON.parse(content);

      if (state.completedPhases && Array.isArray(state.completedPhases)) {
        this.completed = new Set(state.completedPhases);
        return true;
      }
    } catch (error) {
      console.error('Failed to load setup state:', error);
    }

    return false;
  }

  /**
   * Clear saved state
   */
  public clearState(projectPath: string): void {
    const stateFile = path.join(projectPath, '.automaker', 'setup-state.json');

    if (fs.existsSync(stateFile)) {
      fs.unlinkSync(stateFile);
    }
  }
}

/**
 * Common rollback actions
 */
export const RollbackActions = {
  /**
   * Remove a directory if it exists
   */
  removeDirectory(dirPath: string, description?: string): RollbackAction {
    return {
      type: 'remove_directory',
      path: dirPath,
      description: description || `Remove directory: ${dirPath}`,
      execute: () => {
        if (fs.existsSync(dirPath)) {
          fs.rmSync(dirPath, { recursive: true, force: true });
        }
      },
    };
  },

  /**
   * Remove a file if it exists
   */
  removeFile(filePath: string, description?: string): RollbackAction {
    return {
      type: 'remove_file',
      path: filePath,
      description: description || `Remove file: ${filePath}`,
      execute: () => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      },
    };
  },

  /**
   * Restore a file from backup
   */
  restoreFile(filePath: string, backupPath: string, description?: string): RollbackAction {
    return {
      type: 'restore_file',
      path: filePath,
      backupPath,
      description: description || `Restore file: ${filePath}`,
      execute: () => {
        if (fs.existsSync(backupPath)) {
          fs.copyFileSync(backupPath, filePath);
          fs.unlinkSync(backupPath);
        }
      },
    };
  },

  /**
   * Custom rollback action
   */
  custom(description: string, execute: () => void | Promise<void>): RollbackAction {
    return {
      type: 'custom',
      description,
      execute,
    };
  },
};

/**
 * Clean up .automaker directory if setup is incomplete
 */
export function cleanupAutomakerDir(projectPath: string, force: boolean = false): void {
  const automakerDir = path.join(projectPath, '.automaker');

  if (!fs.existsSync(automakerDir)) {
    return;
  }

  // Check if directory is empty or only contains setup state
  const entries = fs.readdirSync(automakerDir);
  const onlyState =
    entries.length === 0 || (entries.length === 1 && entries[0] === 'setup-state.json');

  if (force || onlyState) {
    fs.rmSync(automakerDir, { recursive: true, force: true });
    console.log('✓ Cleaned up .automaker directory');
  } else {
    console.log('⚠ .automaker directory contains files, skipping cleanup');
  }
}

/**
 * Clean up .beads directory if setup is incomplete
 */
export function cleanupBeadsDir(projectPath: string, force: boolean = false): void {
  const beadsDir = path.join(projectPath, '.beads');

  if (!fs.existsSync(beadsDir)) {
    return;
  }

  // Check if directory is empty
  const entries = fs.readdirSync(beadsDir);

  if (force || entries.length === 0) {
    fs.rmSync(beadsDir, { recursive: true, force: true });
    console.log('✓ Cleaned up .beads directory');
  } else {
    console.log('⚠ .beads directory contains files, skipping cleanup');
  }
}

/**
 * Create a backup of a file before modifying it
 */
export function backupFile(filePath: string): string | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const backupPath = `${filePath}.backup-${Date.now()}`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

/**
 * Remove all backup files for a given path
 */
export function cleanupBackups(filePath: string): void {
  const dir = path.dirname(filePath);
  const filename = path.basename(filePath);

  if (!fs.existsSync(dir)) {
    return;
  }

  const entries = fs.readdirSync(dir);
  const backups = entries.filter((entry) => entry.startsWith(`${filename}.backup-`));

  for (const backup of backups) {
    const backupPath = path.join(dir, backup);
    fs.unlinkSync(backupPath);
  }
}

/**
 * Safe file write with automatic backup
 */
export function safeWriteFile(
  filePath: string,
  content: string,
  rollbackManager?: RollbackManager
): void {
  const exists = fs.existsSync(filePath);
  let backupPath: string | null = null;

  // Create backup if file exists
  if (exists) {
    backupPath = backupFile(filePath);
  }

  // Write the file
  fs.writeFileSync(filePath, content, 'utf-8');

  // Add rollback action
  if (rollbackManager) {
    if (exists && backupPath) {
      rollbackManager.addAction(RollbackActions.restoreFile(filePath, backupPath));
    } else {
      rollbackManager.addAction(RollbackActions.removeFile(filePath));
    }
  }
}

/**
 * Safe directory creation with automatic rollback
 */
export function safeMkdir(dirPath: string, rollbackManager?: RollbackManager): void {
  const exists = fs.existsSync(dirPath);

  if (!exists) {
    fs.mkdirSync(dirPath, { recursive: true });

    // Add rollback action
    if (rollbackManager) {
      rollbackManager.addAction(RollbackActions.removeDirectory(dirPath));
    }
  }
}
