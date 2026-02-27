/**
 * HITL Form Service
 *
 * Manages human-in-the-loop form requests. Callers (agents, flows, API)
 * create form requests with JSON Schema definitions. The UI renders them
 * as dialogs. Responses route back to the original caller.
 *
 * Forms are persisted to disk at {projectPath}/.automaker/hitl-forms.json
 * using atomic writes (temp file → rename). The in-memory Map serves as a
 * cache; disk is the source of truth on restart.
 */

import { randomUUID } from 'node:crypto';
import fs from 'fs/promises';
import { join } from 'path';
import { createLogger } from '@protolabs-ai/utils';
import { ensureAutomakerDir } from '@protolabs-ai/platform';
import type {
  Feature,
  HITLFormRequest,
  HITLFormRequestInput,
  HITLFormRequestSummary,
} from '@protolabs-ai/types';
import type { ChannelRouter } from './channel-router.js';
import type { EventEmitter } from '../lib/events.js';

const logger = createLogger('HITLFormService');

/** Default TTL: 1 hour */
const DEFAULT_TTL_SECONDS = 3600;
/** Maximum TTL: 24 hours */
const MAX_TTL_SECONDS = 86400;
/** Cleanup interval: 5 minutes */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
/** Purge records older than 24 hours */
const PURGE_AGE_MS = 24 * 60 * 60 * 1000;

export interface HITLFormServiceDeps {
  events: EventEmitter;
  followUpFeature: (projectPath: string, featureId: string, prompt: string) => Promise<void>;
  /** Known project paths for loading persisted forms on startup */
  getKnownProjectPaths?: () => string[];
  /** Load a feature by projectPath + featureId (used for channel routing) */
  getFeature?: (projectPath: string, featureId: string) => Promise<Feature | null>;
}

export class HITLFormService {
  private forms = new Map<string, HITLFormRequest>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private events: EventEmitter;
  private followUpFeature: HITLFormServiceDeps['followUpFeature'];
  private getKnownProjectPaths: () => string[];
  private getFeatureFn:
    | ((projectPath: string, featureId: string) => Promise<Feature | null>)
    | null = null;
  private channelRouter: ChannelRouter | null = null;

  constructor(deps: HITLFormServiceDeps) {
    this.events = deps.events;
    this.followUpFeature = deps.followUpFeature;
    this.getKnownProjectPaths = deps.getKnownProjectPaths ?? (() => []);
    this.getFeatureFn = deps.getFeature ?? null;
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);

    // Load persisted forms on startup (fire-and-forget)
    this.loadPersistedForms().catch((err) =>
      logger.error('Failed to load persisted HITL forms:', err)
    );
  }

  /**
   * Wire in the channel router for non-UI form delivery.
   * When set and a form request has replyChannel, the form will be sent
   * via the appropriate channel handler instead of emitting hitl:form-requested.
   */
  setChannelRouter(channelRouter: ChannelRouter): void {
    this.channelRouter = channelRouter;
    logger.info('ChannelRouter wired into HITLFormService');
  }

  /**
   * Create a new form request
   */
  create(input: HITLFormRequestInput): HITLFormRequest {
    if (!input.title || !input.steps?.length) {
      throw new Error('title and at least one step are required');
    }

    if (input.callerType === 'agent' && !input.featureId) {
      throw new Error('featureId is required for agent caller type');
    }

    const ttl = Math.min(Math.max(input.ttlSeconds ?? DEFAULT_TTL_SECONDS, 60), MAX_TTL_SECONDS);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttl * 1000);

    const form: HITLFormRequest = {
      ...input,
      id: `hitl-${randomUUID().slice(0, 8)}`,
      status: 'pending',
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    this.forms.set(form.id, form);
    this.persistForm(form);

    if (form.replyChannel && this.channelRouter && form.featureId && form.projectPath) {
      // Non-UI channel: route form delivery through the channel handler
      const router = this.channelRouter;
      const featureId = form.featureId;
      const projectPath = form.projectPath;
      const formCopy = form;
      const getFeatureFn = this.getFeatureFn;

      (async () => {
        try {
          let feature: Feature | null = null;
          if (getFeatureFn) {
            feature = await getFeatureFn(projectPath, featureId);
          }
          if (feature) {
            await router.getHandler(feature).sendHITLForm(feature, input);
          } else {
            // Feature not found — fall back to UI event
            this.events.emit('hitl:form-requested', {
              formId: formCopy.id,
              title: formCopy.title,
              callerType: formCopy.callerType,
              featureId: formCopy.featureId,
              projectPath: formCopy.projectPath,
              stepCount: formCopy.steps.length,
              expiresAt: formCopy.expiresAt,
            });
          }
        } catch (err) {
          logger.error(`Failed to route HITL form ${formCopy.id} to channel handler:`, err);
        }
      })();
    } else {
      // UI channel (no replyChannel): emit hitl:form-requested for backward compatibility
      this.events.emit('hitl:form-requested', {
        formId: form.id,
        title: form.title,
        callerType: form.callerType,
        featureId: form.featureId,
        projectPath: form.projectPath,
        stepCount: form.steps.length,
        expiresAt: form.expiresAt,
      });
    }

    logger.info(
      `Form created: ${form.id} (${form.title}) — ${form.steps.length} step(s), TTL ${ttl}s`
    );
    return form;
  }

  /**
   * Get a form by ID
   */
  get(formId: string): HITLFormRequest | undefined {
    const form = this.forms.get(formId);
    if (form && form.status === 'pending' && new Date(form.expiresAt) < new Date()) {
      form.status = 'expired';
    }
    return form;
  }

  /**
   * List pending forms, optionally filtered by projectPath
   */
  listPending(projectPath?: string): HITLFormRequestSummary[] {
    const now = new Date();
    const summaries: HITLFormRequestSummary[] = [];

    for (const form of this.forms.values()) {
      // Auto-expire
      if (form.status === 'pending' && new Date(form.expiresAt) < now) {
        form.status = 'expired';
      }

      if (form.status !== 'pending') continue;
      if (projectPath && form.projectPath !== projectPath) continue;

      summaries.push({
        id: form.id,
        title: form.title,
        status: form.status,
        callerType: form.callerType,
        featureId: form.featureId,
        stepCount: form.steps.length,
        createdAt: form.createdAt,
        expiresAt: form.expiresAt,
      });
    }

    return summaries;
  }

  /**
   * Submit a response to a form
   */
  async submit(formId: string, response: Record<string, unknown>[]): Promise<HITLFormRequest> {
    const form = this.forms.get(formId);
    if (!form) {
      throw new Error(`Form not found: ${formId}`);
    }

    if (form.status !== 'pending') {
      throw new Error(`Form ${formId} is not pending (status: ${form.status})`);
    }

    if (new Date(form.expiresAt) < new Date()) {
      form.status = 'expired';
      throw new Error(`Form ${formId} has expired`);
    }

    if (response.length !== form.steps.length) {
      throw new Error(`Expected ${form.steps.length} response(s), got ${response.length}`);
    }

    form.status = 'submitted';
    form.respondedAt = new Date().toISOString();
    form.response = response;
    this.persistForm(form);

    this.events.emit('hitl:form-responded', {
      formId: form.id,
      callerType: form.callerType,
      featureId: form.featureId,
      projectPath: form.projectPath,
      cancelled: false,
      flowThreadId: form.flowThreadId,
      response: form.response,
    });

    logger.info(`Form submitted: ${form.id}`);

    // Route response to caller
    await this.routeResponse(form);

    return form;
  }

  /**
   * Cancel a pending form
   */
  async cancel(formId: string): Promise<HITLFormRequest> {
    const form = this.forms.get(formId);
    if (!form) {
      throw new Error(`Form not found: ${formId}`);
    }

    if (form.status !== 'pending') {
      throw new Error(`Form ${formId} is not pending (status: ${form.status})`);
    }

    form.status = 'cancelled';
    form.respondedAt = new Date().toISOString();
    this.persistForm(form);

    this.events.emit('hitl:form-responded', {
      formId: form.id,
      callerType: form.callerType,
      featureId: form.featureId,
      projectPath: form.projectPath,
      cancelled: true,
    });

    logger.info(`Form cancelled: ${form.id}`);

    // Route cancellation to caller
    await this.routeCancellation(form);

    return form;
  }

  /**
   * Shut down the service
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.forms.clear();
    logger.info('HITLFormService shut down');
  }

  // --- Disk persistence ---

  private getStoragePath(projectPath: string): string {
    return join(projectPath, '.automaker', 'hitl-forms.json');
  }

  private async loadFromDisk(projectPath: string): Promise<HITLFormRequest[]> {
    try {
      const content = await fs.readFile(this.getStoragePath(projectPath), 'utf-8');
      const data = JSON.parse(content);
      return Array.isArray(data) ? data : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      logger.error(`Failed to read HITL forms for ${projectPath}:`, error);
      return [];
    }
  }

  private async saveToDisk(projectPath: string, forms: HITLFormRequest[]): Promise<void> {
    try {
      await ensureAutomakerDir(projectPath);
      const filePath = this.getStoragePath(projectPath);
      const tempPath = `${filePath}.tmp.${Date.now()}`;
      await fs.writeFile(tempPath, JSON.stringify(forms, null, 2), 'utf-8');
      await fs.rename(tempPath, filePath);
    } catch (error) {
      logger.error(`Failed to persist HITL forms for ${projectPath}:`, error);
    }
  }

  /** Persist a single form to its project's disk file */
  private persistForm(form: HITLFormRequest): void {
    if (!form.projectPath) return;

    // Collect all forms for this project and save
    const projectForms: HITLFormRequest[] = [];
    for (const f of this.forms.values()) {
      if (f.projectPath === form.projectPath) {
        projectForms.push(f);
      }
    }
    this.saveToDisk(form.projectPath, projectForms).catch((err) =>
      logger.error(`Persist failed for project ${form.projectPath}:`, err)
    );
  }

  /** Load persisted forms from all known projects on startup */
  private async loadPersistedForms(): Promise<void> {
    const projectPaths = this.getKnownProjectPaths();
    let loaded = 0;

    for (const projectPath of projectPaths) {
      const forms = await this.loadFromDisk(projectPath);
      for (const form of forms) {
        // Only load pending forms that haven't expired
        if (form.status === 'pending' && new Date(form.expiresAt) > new Date()) {
          this.forms.set(form.id, form);
          loaded++;
        }
      }
    }

    if (loaded > 0) {
      logger.info(`Loaded ${loaded} persisted HITL form(s) from ${projectPaths.length} project(s)`);
    }
  }

  // --- Private methods ---

  private async routeResponse(form: HITLFormRequest): Promise<void> {
    try {
      switch (form.callerType) {
        case 'agent': {
          if (!form.projectPath || !form.featureId) {
            logger.warn(
              `Cannot route agent response: missing projectPath or featureId for form ${form.id}`
            );
            return;
          }
          const message = JSON.stringify({
            type: 'hitl_form_response',
            formId: form.id,
            title: form.title,
            data: form.response,
          });
          await this.followUpFeature(form.projectPath, form.featureId, message);
          logger.info(`Routed form response to agent: feature=${form.featureId}`);
          break;
        }
        case 'flow': {
          // Flow service picks up via the hitl:form-responded event emitted in submit()
          // which includes flowThreadId and response fields
          break;
        }
        case 'api': {
          // No-op — caller polls via get()
          break;
        }
      }
    } catch (error) {
      logger.error(`Failed to route response for form ${form.id}:`, error);
    }
  }

  private async routeCancellation(form: HITLFormRequest): Promise<void> {
    try {
      if (form.callerType === 'agent' && form.projectPath && form.featureId) {
        const message = JSON.stringify({
          type: 'hitl_form_cancelled',
          formId: form.id,
          title: form.title,
        });
        await this.followUpFeature(form.projectPath, form.featureId, message);
        logger.info(`Routed form cancellation to agent: feature=${form.featureId}`);
      }
    } catch (error) {
      logger.error(`Failed to route cancellation for form ${form.id}:`, error);
    }
  }

  private cleanup(): void {
    const now = new Date();
    const purgeThreshold = new Date(now.getTime() - PURGE_AGE_MS);
    let expired = 0;
    let purged = 0;
    const dirtyProjects = new Set<string>();

    for (const [id, form] of this.forms) {
      // Expire pending forms past TTL
      if (form.status === 'pending' && new Date(form.expiresAt) < now) {
        form.status = 'expired';
        expired++;
        if (form.projectPath) dirtyProjects.add(form.projectPath);
      }

      // Purge old non-pending forms
      if (form.status !== 'pending' && new Date(form.createdAt) < purgeThreshold) {
        this.forms.delete(id);
        purged++;
        if (form.projectPath) dirtyProjects.add(form.projectPath);
      }
    }

    // Persist changes to affected projects
    for (const projectPath of dirtyProjects) {
      const projectForms: HITLFormRequest[] = [];
      for (const f of this.forms.values()) {
        if (f.projectPath === projectPath) projectForms.push(f);
      }
      this.saveToDisk(projectPath, projectForms).catch((err) =>
        logger.error(`Cleanup persist failed for ${projectPath}:`, err)
      );
    }

    if (expired > 0 || purged > 0) {
      logger.debug(`Cleanup: expired=${expired}, purged=${purged}, remaining=${this.forms.size}`);
    }
  }
}
