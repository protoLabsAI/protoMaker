/**
 * Ceremony Store - State management for ceremony audit log entries
 *
 * Tracks ceremony events (fired via ceremony:fired WebSocket events)
 * and loads historical entries from the GET /api/ceremonies/log endpoint.
 */

import { create } from 'zustand';
import type { CeremonyAuditEntry, CeremonyDeliveryStatus } from '@protolabs-ai/types';

// ============================================================================
// State Interface
// ============================================================================

interface CeremonyState {
  entries: CeremonyAuditEntry[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
}

// ============================================================================
// Actions Interface
// ============================================================================

interface CeremonyActions {
  setEntries: (entries: CeremonyAuditEntry[]) => void;
  addEntry: (entry: CeremonyAuditEntry) => void;
  updateDeliveryStatus: (id: string, status: CeremonyDeliveryStatus) => void;
  markAllRead: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: CeremonyState = {
  entries: [],
  unreadCount: 0,
  isLoading: false,
  error: null,
};

// ============================================================================
// Store
// ============================================================================

export const useCeremonyStore = create<CeremonyState & CeremonyActions>((set) => ({
  ...initialState,

  setEntries: (entries) =>
    set({
      entries,
      // Historical entries are all "read" — unread count stays as-is for live events
    }),

  addEntry: (entry) =>
    set((state) => ({
      entries: [entry, ...state.entries],
      unreadCount: state.unreadCount + 1,
    })),

  updateDeliveryStatus: (id, status) =>
    set((state) => ({
      entries: state.entries.map((e) => (e.id === id ? { ...e, deliveryStatus: status } : e)),
    })),

  markAllRead: () => set({ unreadCount: 0 }),

  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  reset: () => set(initialState),
}));
