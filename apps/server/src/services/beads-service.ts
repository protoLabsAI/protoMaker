/**
 * BeadsService - Wrapper for Beads CLI (`bd`)
 * Provides programmatic access to Ava's task manager with automatic sync after mutations
 */

import { spawnProcess } from '@protolabs-ai/platform';
import { createLogger } from '@protolabs-ai/utils';
import type {
  BeadsTask,
  CreateBeadsTaskOptions,
  UpdateBeadsTaskOptions,
  ListBeadsTasksOptions,
  BeadsOperationResult,
} from '@protolabs-ai/types';
import type { EventEmitter } from '../lib/events.js';

const logger = createLogger('BeadsService');

export class BeadsService {
  private cliPath: string;
  private events?: EventEmitter;

  constructor(cliPath = 'bd', events?: EventEmitter) {
    this.cliPath = cliPath;
    this.events = events;
  }

  /**
   * Check if Beads CLI is available
   */
  async checkCliAvailable(): Promise<boolean> {
    try {
      const result = await spawnProcess({
        command: 'which',
        args: [this.cliPath],
        cwd: process.cwd(),
      });
      return result.exitCode === 0 && result.stdout.trim().length > 0;
    } catch (error) {
      logger.error('Failed to check Beads CLI availability:', error);
      return false;
    }
  }

  /**
   * Execute a Beads command and parse JSON output
   */
  private async executeCommand<T>(
    args: string[],
    cwd: string = process.cwd()
  ): Promise<BeadsOperationResult<T>> {
    try {
      const result = await spawnProcess({
        command: this.cliPath,
        args: [...args, '--json'],
        cwd,
      });

      if (result.exitCode !== 0) {
        const errorMsg = result.stderr || result.stdout || 'Unknown error';
        logger.error(`Beads command failed: ${args.join(' ')}`, errorMsg);
        return {
          success: false,
          error: errorMsg,
        };
      }

      // Parse JSON output
      try {
        const data = JSON.parse(result.stdout) as T;
        return {
          success: true,
          data,
        };
      } catch (parseError) {
        logger.error('Failed to parse Beads JSON output:', parseError);
        return {
          success: false,
          error: 'Failed to parse JSON output',
        };
      }
    } catch (error) {
      logger.error(`Beads command execution failed: ${args.join(' ')}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Execute sync after a mutation
   */
  private async sync(cwd: string): Promise<void> {
    try {
      const result = await spawnProcess({
        command: this.cliPath,
        args: ['sync'],
        cwd,
      });

      if (result.exitCode !== 0) {
        logger.warn('Beads sync failed:', result.stderr || result.stdout);
      } else {
        logger.debug('Beads sync completed successfully');
      }
    } catch (error) {
      logger.warn('Failed to execute Beads sync:', error);
    }
  }

  /**
   * List Beads tasks
   */
  async listTasks(
    projectPath: string,
    options: ListBeadsTasksOptions = {}
  ): Promise<BeadsOperationResult<BeadsTask[]>> {
    const args = ['list'];

    if (options.status === 'closed') {
      args.push('--closed');
    } else if (options.status === 'all') {
      args.push('--all');
    }

    if (options.owner) {
      args.push('--owner', options.owner);
    }

    if (options.label) {
      args.push('--label', options.label);
    }

    if (options.limit) {
      args.push('--limit', String(options.limit));
    }

    return this.executeCommand<BeadsTask[]>(args, projectPath);
  }

  /**
   * Get a specific Beads task by ID
   */
  async getTask(projectPath: string, taskId: string): Promise<BeadsOperationResult<BeadsTask>> {
    const result = await this.executeCommand<BeadsTask[]>(['show', taskId], projectPath);

    if (!result.success || !result.data || result.data.length === 0) {
      return {
        success: false,
        error: result.error || 'Task not found',
      };
    }

    return {
      success: true,
      data: result.data[0],
    };
  }

  /**
   * Create a new Beads task
   */
  async createTask(
    projectPath: string,
    options: CreateBeadsTaskOptions
  ): Promise<BeadsOperationResult<BeadsTask>> {
    const args = ['create'];

    // Use quick capture mode to get the ID
    args.push('--title', options.title);

    if (options.description) {
      args.push('--description', options.description);
    }

    if (options.priority !== undefined) {
      args.push('--priority', String(options.priority));
    }

    if (options.issueType) {
      args.push('--type', options.issueType);
    }

    if (options.owner) {
      args.push('--owner', options.owner);
    }

    if (options.labels && options.labels.length > 0) {
      args.push('--labels', options.labels.join(','));
    }

    if (options.parent) {
      args.push('--parent', options.parent);
    }

    // Execute create command
    const result = await this.executeCommand<BeadsTask[]>(args, projectPath);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    // Sync after mutation
    await this.sync(projectPath);

    // Emit event
    if (this.events && result.data && result.data.length > 0) {
      this.events.emit('beads:task-created', {
        projectPath,
        task: result.data[0],
      });
    }

    return {
      success: true,
      data: result.data?.[0],
    };
  }

  /**
   * Update a Beads task
   */
  async updateTask(
    projectPath: string,
    taskId: string,
    options: UpdateBeadsTaskOptions
  ): Promise<BeadsOperationResult<BeadsTask>> {
    const args = ['edit', taskId];

    if (options.title) {
      args.push('--title', options.title);
    }

    if (options.description !== undefined) {
      args.push('--description', options.description);
    }

    if (options.priority !== undefined) {
      args.push('--priority', String(options.priority));
    }

    if (options.issueType) {
      args.push('--type', options.issueType);
    }

    if (options.owner) {
      args.push('--owner', options.owner);
    }

    if (options.labels && options.labels.length > 0) {
      args.push('--labels', options.labels.join(','));
    }

    // Execute update command
    const result = await this.executeCommand<BeadsTask[]>(args, projectPath);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    // Sync after mutation
    await this.sync(projectPath);

    // Get updated task
    const updatedTask = await this.getTask(projectPath, taskId);

    // Emit event
    if (this.events && updatedTask.success && updatedTask.data) {
      this.events.emit('beads:task-updated', {
        projectPath,
        taskId,
        task: updatedTask.data,
      });
    }

    return updatedTask;
  }

  /**
   * Close a Beads task
   */
  async closeTask(projectPath: string, taskId: string): Promise<BeadsOperationResult<void>> {
    const result = await this.executeCommand<unknown>(['close', taskId], projectPath);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    // Sync after mutation
    await this.sync(projectPath);

    // Emit event
    if (this.events) {
      this.events.emit('beads:task-closed', {
        projectPath,
        taskId,
      });
    }

    return {
      success: true,
    };
  }

  /**
   * Reopen a closed Beads task
   */
  async reopenTask(projectPath: string, taskId: string): Promise<BeadsOperationResult<void>> {
    const result = await this.executeCommand<unknown>(['reopen', taskId], projectPath);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    // Sync after mutation
    await this.sync(projectPath);

    // Emit event
    if (this.events) {
      this.events.emit('beads:task-updated', {
        projectPath,
        taskId,
        status: 'open',
      });
    }

    return {
      success: true,
    };
  }

  /**
   * Get tasks that are ready to work on (no unmet dependencies)
   */
  async getReadyTasks(projectPath: string): Promise<BeadsOperationResult<BeadsTask[]>> {
    const result = await this.executeCommand<BeadsTask[]>(['ready'], projectPath);
    return result;
  }

  /**
   * Add a dependency between tasks
   */
  async addDependency(
    projectPath: string,
    taskId: string,
    dependsOn: string
  ): Promise<BeadsOperationResult<void>> {
    const result = await this.executeCommand<unknown>(
      ['add-dependency', taskId, dependsOn],
      projectPath
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    // Sync after mutation
    await this.sync(projectPath);

    // Emit event
    if (this.events) {
      this.events.emit('beads:dependency-added', {
        projectPath,
        taskId,
        dependsOn,
      });
    }

    return {
      success: true,
    };
  }
}
