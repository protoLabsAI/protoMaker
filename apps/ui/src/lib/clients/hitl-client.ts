/**
 * HITL (Human-in-the-Loop) client mixin: forms, notifications, actionable items, event history.
 *
 * Extracted from the monolithic http-api-client.ts — contains:
 *   - notifications     (list, unread count, mark read, dismiss + WS events)
 *   - hitlForms         (create, get, list, submit, cancel + WS events)
 *   - actionableItems   (global/project list, create, status, read, snooze, dismiss + WS events)
 *   - eventHistory      (list, get, delete, clear, replay)
 */
import type {
  EventHistoryFilter,
  ActionableItem,
  ActionableItemStatus,
  CreateActionableItemInput,
  HITLFormRequest,
} from '@protolabs-ai/types';
import type { NotificationsAPI, EventHistoryAPI } from '../electron';
import type { EventCallback } from './base-http-client';
import { BaseHttpClient, type Constructor } from './base-http-client';

export const withHitlClient = <TBase extends Constructor<BaseHttpClient>>(Base: TBase) =>
  class extends Base {
    // Notifications API - project-level notifications
    notifications: NotificationsAPI & {
      onNotificationCreated: (callback: (notification: unknown) => void) => () => void;
    } = {
      list: (projectPath: string) => this.post('/api/notifications/list', { projectPath }),

      getUnreadCount: (projectPath: string) =>
        this.post('/api/notifications/unread-count', { projectPath }),

      markAsRead: (projectPath: string, notificationId?: string) =>
        this.post('/api/notifications/mark-read', { projectPath, notificationId }),

      dismiss: (projectPath: string, notificationId?: string) =>
        this.post('/api/notifications/dismiss', { projectPath, notificationId }),

      onNotificationCreated: (callback: (notification: unknown) => void): (() => void) => {
        return this.subscribeToEvent('notification:created', callback as EventCallback);
      },
    };

    // HITL Forms API - human-in-the-loop structured input
    hitlForms = {
      create: (input: {
        title: string;
        description?: string;
        steps: Array<{
          schema: Record<string, unknown>;
          uiSchema?: Record<string, unknown>;
          title?: string;
          description?: string;
        }>;
        callerType: 'agent' | 'flow' | 'api';
        featureId?: string;
        projectPath?: string;
        ttlSeconds?: number;
      }): Promise<{ success: boolean; form?: HITLFormRequest; error?: string }> =>
        this.post('/api/hitl-forms/create', input),

      get: (
        formId: string
      ): Promise<{ success: boolean; form?: HITLFormRequest; error?: string }> =>
        this.post('/api/hitl-forms/get', { formId }),

      list: (
        projectPath?: string
      ): Promise<{ success: boolean; forms?: HITLFormRequest[]; error?: string }> =>
        this.post('/api/hitl-forms/list', { projectPath }),

      submit: (
        formId: string,
        response: Record<string, unknown>[]
      ): Promise<{ success: boolean; form?: HITLFormRequest; error?: string }> =>
        this.post('/api/hitl-forms/submit', { formId, response }),

      cancel: (
        formId: string
      ): Promise<{ success: boolean; form?: HITLFormRequest; error?: string }> =>
        this.post('/api/hitl-forms/cancel', { formId }),

      onFormRequested: (callback: (payload: unknown) => void): (() => void) => {
        return this.subscribeToEvent('hitl:form-requested', callback as EventCallback);
      },

      onFormResponded: (callback: (payload: unknown) => void): (() => void) => {
        return this.subscribeToEvent('hitl:form-responded', callback as EventCallback);
      },
    };

    // Actionable Items API - unified inbox for HITL forms, approvals, notifications, gates
    actionableItems = {
      listGlobal: (options?: {
        includeActed?: boolean;
        includeDismissed?: boolean;
        includeExpired?: boolean;
      }): Promise<{
        success: boolean;
        items: ActionableItem[];
        pendingCount: number;
        unreadCount: number;
      }> => this.post('/api/actionable-items/global', { ...options }),

      list: (
        projectPath: string,
        options?: { includeActed?: boolean; includeDismissed?: boolean; includeExpired?: boolean }
      ): Promise<{
        success: boolean;
        items: ActionableItem[];
        pendingCount: number;
        unreadCount: number;
      }> => this.post('/api/actionable-items/list', { projectPath, ...options }),

      create: (
        projectPath: string,
        input: Omit<CreateActionableItemInput, 'projectPath'>
      ): Promise<{ success: boolean; item: ActionableItem }> =>
        this.post('/api/actionable-items/create', { projectPath, ...input }),

      updateStatus: (
        projectPath: string,
        itemId: string,
        status: ActionableItemStatus
      ): Promise<{ success: boolean; item: ActionableItem }> =>
        this.post('/api/actionable-items/update-status', { projectPath, itemId, status }),

      markRead: (
        projectPath: string,
        itemId?: string
      ): Promise<{ success: boolean; item?: ActionableItem; count?: number }> =>
        this.post('/api/actionable-items/mark-read', { projectPath, itemId }),

      snooze: (
        projectPath: string,
        itemId: string,
        snoozedUntil: string
      ): Promise<{ success: boolean; item: ActionableItem }> =>
        this.post('/api/actionable-items/snooze', { projectPath, itemId, snoozedUntil }),

      dismiss: (
        projectPath: string,
        itemId?: string
      ): Promise<{ success: boolean; dismissed?: boolean; count?: number }> =>
        this.post('/api/actionable-items/dismiss', { projectPath, itemId }),

      onItemCreated: (callback: (item: ActionableItem) => void): (() => void) => {
        return this.subscribeToEvent('actionable-item:created', callback as EventCallback);
      },

      onItemStatusChanged: (
        callback: (data: { itemId: string; status: ActionableItemStatus }) => void
      ): (() => void) => {
        return this.subscribeToEvent('actionable-item:status-changed', callback as EventCallback);
      },
    };

    // Event History API - stored events for debugging and replay
    eventHistory: EventHistoryAPI = {
      list: (projectPath: string, filter?: EventHistoryFilter) =>
        this.post('/api/event-history/list', { projectPath, filter }),

      get: (projectPath: string, eventId: string) =>
        this.post('/api/event-history/get', { projectPath, eventId }),

      delete: (projectPath: string, eventId: string) =>
        this.post('/api/event-history/delete', { projectPath, eventId }),

      clear: (projectPath: string) => this.post('/api/event-history/clear', { projectPath }),

      replay: (projectPath: string, eventId: string, hookIds?: string[]) =>
        this.post('/api/event-history/replay', { projectPath, eventId, hookIds }),
    };
  };
