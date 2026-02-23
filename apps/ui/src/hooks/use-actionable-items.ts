/**
 * Hooks for actionable items - loading and WebSocket event subscriptions.
 */

import { useEffect } from 'react';
import { useActionableItemsStore } from '@/store/actionable-items-store';
import { getHttpApiClient } from '@/lib/http-api-client';
import { pathsEqual } from '@/lib/utils';
import type { ActionableItem, ActionableItemStatus } from '@automaker/types';

/**
 * Subscribe to actionable item WebSocket events and update the store.
 * Should be used in a component that's always mounted when a project is open.
 */
export function useActionableItemEvents(projectPath: string | null) {
  const addItem = useActionableItemsStore((s) => s.addItem);
  const updateItemStatus = useActionableItemsStore((s) => s.updateItemStatus);

  useEffect(() => {
    if (!projectPath) return;

    const api = getHttpApiClient();

    const unsubCreated = api.actionableItems.onItemCreated((item: ActionableItem) => {
      if (!pathsEqual(item.projectPath, projectPath)) return;
      addItem(item);
    });

    const unsubChanged = api.actionableItems.onItemStatusChanged(
      (data: { itemId: string; status: ActionableItemStatus }) => {
        updateItemStatus(data.itemId, data.status);
      }
    );

    return () => {
      unsubCreated();
      unsubChanged();
    };
  }, [projectPath, addItem, updateItemStatus]);
}

/**
 * Load actionable items for a project on mount or when projectPath changes.
 */
export function useLoadActionableItems(projectPath: string | null) {
  const setItems = useActionableItemsStore((s) => s.setItems);
  const setPendingCount = useActionableItemsStore((s) => s.setPendingCount);
  const setUnreadCount = useActionableItemsStore((s) => s.setUnreadCount);
  const setLoading = useActionableItemsStore((s) => s.setLoading);
  const setError = useActionableItemsStore((s) => s.setError);
  const reset = useActionableItemsStore((s) => s.reset);

  useEffect(() => {
    if (!projectPath) {
      reset();
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const api = getHttpApiClient();
        const result = await api.actionableItems.list(projectPath);

        if (result.success) {
          setItems(result.items);
          setPendingCount(result.pendingCount);
          setUnreadCount(result.unreadCount);
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Failed to load actionable items');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [projectPath, setItems, setPendingCount, setUnreadCount, setLoading, setError, reset]);
}

/**
 * Load global (cross-project) actionable items.
 * Fetches from all known projects and merges into a single list.
 */
export function useLoadGlobalActionableItems() {
  const setGlobalItems = useActionableItemsStore((s) => s.setGlobalItems);
  const setGlobalLoading = useActionableItemsStore((s) => s.setGlobalLoading);

  useEffect(() => {
    const load = async () => {
      setGlobalLoading(true);

      try {
        const api = getHttpApiClient();
        const result = await api.actionableItems.listGlobal();

        if (result.success) {
          setGlobalItems(result.items, result.pendingCount, result.unreadCount);
        }
      } catch {
        // Silently fail for global — individual project loading is the primary path
      } finally {
        setGlobalLoading(false);
      }
    };

    load();
  }, [setGlobalItems, setGlobalLoading]);
}
