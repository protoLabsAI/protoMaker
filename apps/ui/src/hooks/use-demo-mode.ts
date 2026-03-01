import { useSyncExternalStore } from 'react';

let demoMode = false;
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): boolean {
  return demoMode;
}

/** Set the demo mode flag (call once during init). */
export function setDemoMode(value: boolean): void {
  if (demoMode !== value) {
    demoMode = value;
    for (const cb of listeners) cb();
  }
}

/** Returns true when the server is running in demo mode. */
export function useDemoMode(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
