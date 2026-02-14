/**
 * Persistent Sidebar State Hook
 *
 * Persists CopilotKit sidebar preferences in localStorage:
 * - Open/closed state
 * - Selected workflow
 * - Selected model tier
 * - Panel width (if resizable)
 *
 * Uses a dedicated namespace to avoid conflicts.
 */

import { useState, useCallback, useEffect } from 'react';
import type { ModelTier } from './model-selector';

const STORAGE_KEY = 'copilotkit-sidebar-state';

interface SidebarState {
  isOpen: boolean;
  selectedWorkflow: string;
  selectedModel: ModelTier;
}

const DEFAULT_STATE: SidebarState = {
  isOpen: false,
  selectedWorkflow: 'general',
  selectedModel: 'sonnet',
};

function loadState(): SidebarState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<SidebarState>;
      return { ...DEFAULT_STATE, ...parsed };
    }
  } catch {
    // localStorage unavailable or corrupted
  }
  return { ...DEFAULT_STATE };
}

function saveState(state: SidebarState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage unavailable
  }
}

export function useSidebarState() {
  const [state, setState] = useState<SidebarState>(loadState);

  // Persist on every change
  useEffect(() => {
    saveState(state);
  }, [state]);

  const setOpen = useCallback((isOpen: boolean) => {
    setState((prev) => ({ ...prev, isOpen }));
  }, []);

  const setSelectedWorkflow = useCallback((selectedWorkflow: string) => {
    setState((prev) => ({ ...prev, selectedWorkflow }));
  }, []);

  const setSelectedModel = useCallback((selectedModel: ModelTier) => {
    setState((prev) => ({ ...prev, selectedModel }));
  }, []);

  return {
    ...state,
    setOpen,
    setSelectedWorkflow,
    setSelectedModel,
  };
}
