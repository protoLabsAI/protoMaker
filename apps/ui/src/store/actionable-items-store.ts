/**
 * ActionableItems Store - State management for unified actionable items
 *
 * Manages all user attention items: HITL forms, approvals, notifications,
 * escalations, and pipeline gates in a single unified store.
 */

import { create } from 'zustand';
import type { ActionableItem, ActionableItemStatus } from '@automaker/types';

// ============================================================================
// State Interface
// ============================================================================

interface ActionableItemsState {
  // Items for the current project
  items: ActionableItem[];
  pendingCount: number;
  unreadCount: number;
  isLoading: boolean;
  error: string | null;

  // Global (cross-project) items
  globalItems: ActionableItem[];
  globalPendingCount: number;
  globalUnreadCount: number;
  isGlobalLoading: boolean;

  // Popover state
  isPopoverOpen: boolean;

  // Filter/view state
  currentFilter: 'all' | 'pending' | 'acted' | 'dismissed' | 'snoozed';
  currentCategory: string | null;
}

// ============================================================================
// Actions Interface
// ============================================================================

interface ActionableItemsActions {
  // Data management
  setItems: (items: ActionableItem[]) => void;
  setPendingCount: (count: number) => void;
  setUnreadCount: (count: number) => void;
  addItem: (item: ActionableItem) => void;
  updateItemStatus: (itemId: string, status: ActionableItemStatus) => void;
  markAsRead: (itemId: string) => void;
  markAllAsRead: () => void;
  snoozeItem: (itemId: string, snoozedUntil: string) => void;
  dismissItem: (itemId: string) => void;
  dismissAll: () => void;
  removeItem: (itemId: string) => void;

  // Loading state
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Popover state
  setPopoverOpen: (open: boolean) => void;

  // Filter/view state
  setFilter: (filter: ActionableItemsState['currentFilter']) => void;
  setCategory: (category: string | null) => void;

  // Computed getters
  getFilteredItems: () => ActionableItem[];
  getItemsByCategory: () => Record<string, ActionableItem[]>;
  getUrgentCount: () => number;

  // Global (cross-project) items
  setGlobalItems: (items: ActionableItem[], pendingCount: number, unreadCount: number) => void;
  setGlobalLoading: (loading: boolean) => void;
  getGlobalUrgentCount: () => number;

  // Reset
  reset: () => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: ActionableItemsState = {
  items: [],
  pendingCount: 0,
  unreadCount: 0,
  isLoading: false,
  error: null,
  globalItems: [],
  globalPendingCount: 0,
  globalUnreadCount: 0,
  isGlobalLoading: false,
  isPopoverOpen: false,
  currentFilter: 'pending',
  currentCategory: null,
};

// ============================================================================
// Store
// ============================================================================

export const useActionableItemsStore = create<ActionableItemsState & ActionableItemsActions>(
  (set, get) => ({
    ...initialState,

    // Data management
    setItems: (items) =>
      set({
        items,
        pendingCount: items.filter((i) => i.status === 'pending' || i.status === 'snoozed').length,
        unreadCount: items.filter((i) => !i.read && i.status === 'pending').length,
      }),

    setPendingCount: (count) => set({ pendingCount: count }),

    setUnreadCount: (count) => set({ unreadCount: count }),

    addItem: (item) =>
      set((state) => {
        const isPending = item.status === 'pending' || item.status === 'snoozed';
        const isUnread = !item.read && item.status === 'pending';

        return {
          items: [item, ...state.items],
          pendingCount: isPending ? state.pendingCount + 1 : state.pendingCount,
          unreadCount: isUnread ? state.unreadCount + 1 : state.unreadCount,
        };
      }),

    updateItemStatus: (itemId, status) =>
      set((state) => {
        const item = state.items.find((i) => i.id === itemId);
        if (!item) return state;

        const wasPending = item.status === 'pending' || item.status === 'snoozed';
        const wasUnread = !item.read && item.status === 'pending';
        const isPending = status === 'pending' || status === 'snoozed';
        const isUnread = !item.read && status === 'pending';

        const updatedItems = state.items.map((i) =>
          i.id === itemId
            ? {
                ...i,
                status,
                snoozedUntil: status === 'snoozed' ? i.snoozedUntil : undefined,
              }
            : i
        );

        let pendingDelta = 0;
        if (wasPending && !isPending) pendingDelta = -1;
        if (!wasPending && isPending) pendingDelta = 1;

        let unreadDelta = 0;
        if (wasUnread && !isUnread) unreadDelta = -1;
        if (!wasUnread && isUnread) unreadDelta = 1;

        return {
          items: updatedItems,
          pendingCount: Math.max(0, state.pendingCount + pendingDelta),
          unreadCount: Math.max(0, state.unreadCount + unreadDelta),
        };
      }),

    markAsRead: (itemId) =>
      set((state) => {
        const item = state.items.find((i) => i.id === itemId);
        if (!item || item.read) return state;

        const wasUnread = !item.read && item.status === 'pending';

        return {
          items: state.items.map((i) => (i.id === itemId ? { ...i, read: true } : i)),
          unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
        };
      }),

    markAllAsRead: () =>
      set((state) => ({
        items: state.items.map((i) => (i.status === 'pending' ? { ...i, read: true } : i)),
        unreadCount: 0,
      })),

    snoozeItem: (itemId, snoozedUntil) =>
      set((state) => {
        const item = state.items.find((i) => i.id === itemId);
        if (!item) return state;

        const wasUnread = !item.read && item.status === 'pending';

        return {
          items: state.items.map((i) =>
            i.id === itemId ? { ...i, status: 'snoozed', snoozedUntil } : i
          ),
          unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
        };
      }),

    dismissItem: (itemId) =>
      set((state) => {
        const item = state.items.find((i) => i.id === itemId);
        if (!item) return state;

        const wasPending = item.status === 'pending' || item.status === 'snoozed';
        const wasUnread = !item.read && item.status === 'pending';

        return {
          items: state.items.map((i) => (i.id === itemId ? { ...i, status: 'dismissed' } : i)),
          pendingCount: wasPending ? Math.max(0, state.pendingCount - 1) : state.pendingCount,
          unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
        };
      }),

    dismissAll: () =>
      set((state) => ({
        items: state.items.map((i) =>
          i.status === 'pending' || i.status === 'snoozed' ? { ...i, status: 'dismissed' } : i
        ),
        pendingCount: 0,
        unreadCount: 0,
      })),

    removeItem: (itemId) =>
      set((state) => {
        const item = state.items.find((i) => i.id === itemId);
        if (!item) return state;

        const wasPending = item.status === 'pending' || item.status === 'snoozed';
        const wasUnread = !item.read && item.status === 'pending';

        return {
          items: state.items.filter((i) => i.id !== itemId),
          pendingCount: wasPending ? Math.max(0, state.pendingCount - 1) : state.pendingCount,
          unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
        };
      }),

    // Loading state
    setLoading: (loading) => set({ isLoading: loading }),
    setError: (error) => set({ error }),

    // Popover state
    setPopoverOpen: (open) => set({ isPopoverOpen: open }),

    // Filter/view state
    setFilter: (filter) => set({ currentFilter: filter }),
    setCategory: (category) => set({ currentCategory: category }),

    // Computed getters
    getFilteredItems: () => {
      const state = get();
      let filtered = state.items;

      // Apply status filter
      if (state.currentFilter === 'pending') {
        filtered = filtered.filter((i) => i.status === 'pending');
      } else if (state.currentFilter === 'acted') {
        filtered = filtered.filter((i) => i.status === 'acted');
      } else if (state.currentFilter === 'dismissed') {
        filtered = filtered.filter((i) => i.status === 'dismissed');
      } else if (state.currentFilter === 'snoozed') {
        filtered = filtered.filter((i) => i.status === 'snoozed');
      }

      // Apply category filter
      if (state.currentCategory) {
        filtered = filtered.filter((i) => i.category === state.currentCategory);
      }

      return filtered;
    },

    getItemsByCategory: () => {
      const state = get();
      const items = state.currentFilter === 'all' ? state.items : get().getFilteredItems();

      const grouped: Record<string, ActionableItem[]> = {};
      for (const item of items) {
        const category = item.category || 'uncategorized';
        if (!grouped[category]) {
          grouped[category] = [];
        }
        grouped[category].push(item);
      }

      return grouped;
    },

    getUrgentCount: () => {
      const state = get();
      return state.items.filter((i) => {
        if (i.status !== 'pending') return false;

        // Check if item is urgent by priority or expiration
        if (i.priority === 'urgent') return true;

        // Check if close to expiration
        if (i.expiresAt) {
          const now = new Date().getTime();
          const expiresAt = new Date(i.expiresAt).getTime();
          const timeRemaining = expiresAt - now;
          // Less than 10 minutes remaining
          return timeRemaining > 0 && timeRemaining < 10 * 60 * 1000;
        }

        return false;
      }).length;
    },

    // Global (cross-project) items
    setGlobalItems: (items, pendingCount, unreadCount) =>
      set({ globalItems: items, globalPendingCount: pendingCount, globalUnreadCount: unreadCount }),

    setGlobalLoading: (loading) => set({ isGlobalLoading: loading }),

    getGlobalUrgentCount: () => {
      const state = get();
      return state.globalItems.filter((i) => {
        if (i.status !== 'pending') return false;
        if (i.priority === 'urgent') return true;
        if (i.expiresAt) {
          const now = new Date().getTime();
          const expiresAt = new Date(i.expiresAt).getTime();
          const timeRemaining = expiresAt - now;
          return timeRemaining > 0 && timeRemaining < 10 * 60 * 1000;
        }
        return false;
      }).length;
    },

    // Reset
    reset: () => set(initialState),
  })
);
