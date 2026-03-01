/**
 * AutomationService - CRUD and persistence for automation definitions
 *
 * Automations are stored as individual JSON files under:
 *   {projectPath}/.automaker/automations/{id}.json
 *
 * Run history is stored alongside each automation at:
 *   {projectPath}/.automaker/automations/{id}.history.json
 */

import path from 'path';
import { randomUUID } from 'crypto';
import { createLogger, atomicWriteJson, readJsonWithRecovery } from '@protolabs-ai/utils';
import { getAutomakerDir } from '@protolabs-ai/platform';
import type { Automation, AutomationRunRecord } from '@protolabs-ai/types';
import * as secureFs from '../lib/secure-fs.js';

const logger = createLogger('AutomationService');

export interface ListAutomationsFilter {
  enabled?: boolean;
  tags?: string[];
  triggerType?: 'cron' | 'event' | 'webhook';
}

export interface CreateAutomationInput {
  name: string;
  description?: string;
  enabled?: boolean;
  trigger: Automation['trigger'];
  flowId: string;
  modelConfig: Automation['modelConfig'];
  inputSchema?: Automation['inputSchema'];
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateAutomationInput {
  name?: string;
  description?: string;
  enabled?: boolean;
  trigger?: Automation['trigger'];
  flowId?: string;
  modelConfig?: Automation['modelConfig'];
  inputSchema?: Automation['inputSchema'];
  tags?: string[];
  metadata?: Record<string, unknown>;
  lastRunAt?: string;
  nextRunAt?: string;
  lastRunStatus?: Automation['lastRunStatus'];
}

export class AutomationService {
  private static instance: AutomationService;

  private constructor() {}

  static getInstance(): AutomationService {
    if (!AutomationService.instance) {
      AutomationService.instance = new AutomationService();
    }
    return AutomationService.instance;
  }

  // ============================================================================
  // Path helpers
  // ============================================================================

  private getAutomationsDir(projectPath: string): string {
    return path.join(getAutomakerDir(projectPath), 'automations');
  }

  private getAutomationPath(projectPath: string, id: string): string {
    return path.join(this.getAutomationsDir(projectPath), `${id}.json`);
  }

  private getHistoryPath(projectPath: string, id: string): string {
    return path.join(this.getAutomationsDir(projectPath), `${id}.history.json`);
  }

  // ============================================================================
  // Private I/O helpers
  // ============================================================================

  private async ensureAutomationsDir(projectPath: string): Promise<void> {
    const dir = this.getAutomationsDir(projectPath);
    try {
      await secureFs.access(dir);
    } catch {
      await secureFs.mkdir(dir, { recursive: true });
    }
  }

  private async readAutomation(projectPath: string, id: string): Promise<Automation | null> {
    const filePath = this.getAutomationPath(projectPath, id);
    try {
      await secureFs.access(filePath);
    } catch {
      return null;
    }
    const result = await readJsonWithRecovery<Automation>(filePath, null as unknown as Automation, {
      autoRestore: true,
    });
    return result.data ?? null;
  }

  private async writeAutomation(projectPath: string, automation: Automation): Promise<void> {
    await this.ensureAutomationsDir(projectPath);
    await atomicWriteJson(this.getAutomationPath(projectPath, automation.id), automation, {
      backupCount: 3,
    });
  }

  // ============================================================================
  // CRUD
  // ============================================================================

  async create(projectPath: string, input: CreateAutomationInput): Promise<Automation> {
    const now = new Date().toISOString();
    const automation: Automation = {
      id: randomUUID(),
      name: input.name,
      description: input.description,
      enabled: input.enabled ?? true,
      trigger: input.trigger,
      flowId: input.flowId,
      modelConfig: input.modelConfig,
      inputSchema: input.inputSchema,
      tags: input.tags,
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
    };

    await this.writeAutomation(projectPath, automation);
    logger.info(`Created automation ${automation.id} (${automation.name})`);
    return automation;
  }

  async get(projectPath: string, id: string): Promise<Automation | null> {
    return this.readAutomation(projectPath, id);
  }

  async update(projectPath: string, id: string, input: UpdateAutomationInput): Promise<Automation> {
    const existing = await this.readAutomation(projectPath, id);
    if (!existing) {
      throw new Error(`Automation ${id} not found`);
    }

    const updated: Automation = {
      ...existing,
      ...input,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    await this.writeAutomation(projectPath, updated);
    logger.info(`Updated automation ${id}`);
    return updated;
  }

  async delete(projectPath: string, id: string): Promise<void> {
    const filePath = this.getAutomationPath(projectPath, id);
    try {
      await secureFs.access(filePath);
    } catch {
      throw new Error(`Automation ${id} not found`);
    }

    await secureFs.unlink(filePath);

    // Also remove history file if it exists
    const historyPath = this.getHistoryPath(projectPath, id);
    try {
      await secureFs.access(historyPath);
      await secureFs.unlink(historyPath);
    } catch {
      // History file may not exist — that's fine
    }

    logger.info(`Deleted automation ${id}`);
  }

  async list(projectPath: string, filter?: ListAutomationsFilter): Promise<Automation[]> {
    const dir = this.getAutomationsDir(projectPath);

    try {
      await secureFs.access(dir);
    } catch {
      return [];
    }

    const entries = await secureFs.readdir(dir);
    const automationFiles = entries.filter(
      (entry) => entry.endsWith('.json') && !entry.endsWith('.history.json')
    );

    const automations: Automation[] = [];

    for (const file of automationFiles) {
      const id = file.replace(/\.json$/, '');
      const automation = await this.readAutomation(projectPath, id);
      if (!automation) continue;

      if (filter) {
        if (filter.enabled !== undefined && automation.enabled !== filter.enabled) continue;
        if (filter.triggerType && automation.trigger.type !== filter.triggerType) continue;
        if (filter.tags && filter.tags.length > 0) {
          const autoTags = automation.tags ?? [];
          const hasAll = filter.tags.every((t) => autoTags.includes(t));
          if (!hasAll) continue;
        }
      }

      automations.push(automation);
    }

    return automations;
  }

  // ============================================================================
  // Run History
  // ============================================================================

  async getHistory(projectPath: string, id: string): Promise<AutomationRunRecord[]> {
    // Ensure the automation exists
    const automation = await this.readAutomation(projectPath, id);
    if (!automation) {
      throw new Error(`Automation ${id} not found`);
    }

    const historyPath = this.getHistoryPath(projectPath, id);
    try {
      await secureFs.access(historyPath);
    } catch {
      return [];
    }

    const result = await readJsonWithRecovery<AutomationRunRecord[]>(historyPath, [], {
      autoRestore: true,
    });
    return result.data ?? [];
  }

  async appendRunRecord(projectPath: string, record: AutomationRunRecord): Promise<void> {
    await this.ensureAutomationsDir(projectPath);

    const historyPath = this.getHistoryPath(projectPath, record.automationId);
    const existing = await (async () => {
      try {
        await secureFs.access(historyPath);
        const result = await readJsonWithRecovery<AutomationRunRecord[]>(historyPath, [], {
          autoRestore: true,
        });
        return result.data ?? [];
      } catch {
        return [];
      }
    })();

    existing.push(record);
    await atomicWriteJson(historyPath, existing, { backupCount: 2 });
  }
}
