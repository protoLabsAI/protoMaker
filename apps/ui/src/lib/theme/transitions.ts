/**
 * View Transitions API wrapper for smooth theme switching.
 *
 * Supports three animation variants:
 * - polygon: Diagonal wipe using clip-path polygon keyframes
 * - circle: Radial expand from click origin
 * - circle-blur: Radial expand with blur during transition
 *
 * Gracefully falls back to instant swap when API unavailable.
 */

import { useCallback, useMemo } from 'react';

export type TransitionVariant = 'polygon' | 'circle' | 'circle-blur';

export interface ThemeTransitionOptions {
  /** Animation variant (default: 'circle') */
  variant?: TransitionVariant;
  /** Duration in ms (default: 400) */
  duration?: number;
  /** Click origin for circle animations */
  origin?: { x: number; y: number };
}

/** Check if View Transitions API is supported */
function supportsViewTransitions(): boolean {
  return typeof document !== 'undefined' && 'startViewTransition' in document;
}

/** Inject keyframe styles for the chosen variant */
function injectTransitionStyles(
  variant: TransitionVariant,
  duration: number,
  origin?: { x: number; y: number }
) {
  const id = 'theme-transition-styles';
  let style = document.getElementById(id) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = id;
    document.head.appendChild(style);
  }

  const durationSec = (duration / 1000).toFixed(2);

  switch (variant) {
    case 'polygon':
      style.textContent = `
        ::view-transition-old(root) {
          animation: polygon-out ${durationSec}s ease forwards;
        }
        ::view-transition-new(root) {
          animation: polygon-in ${durationSec}s ease forwards;
        }
        @keyframes polygon-out {
          from { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); }
          to { clip-path: polygon(0 0, 0 0, 0 100%, 0 100%); }
        }
        @keyframes polygon-in {
          from { clip-path: polygon(100% 0, 100% 0, 100% 100%, 100% 100%); }
          to { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); }
        }
      `;
      break;

    case 'circle': {
      const x = origin?.x ?? window.innerWidth / 2;
      const y = origin?.y ?? window.innerHeight / 2;
      const maxDist = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
      );
      style.textContent = `
        ::view-transition-old(root) {
          animation: none;
          z-index: 1;
        }
        ::view-transition-new(root) {
          animation: circle-expand ${durationSec}s ease forwards;
          z-index: 2;
        }
        @keyframes circle-expand {
          from { clip-path: circle(0px at ${x}px ${y}px); }
          to { clip-path: circle(${maxDist}px at ${x}px ${y}px); }
        }
      `;
      break;
    }

    case 'circle-blur': {
      const x = origin?.x ?? window.innerWidth / 2;
      const y = origin?.y ?? window.innerHeight / 2;
      const maxDist = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
      );
      style.textContent = `
        ::view-transition-old(root) {
          animation: none;
          z-index: 1;
        }
        ::view-transition-new(root) {
          animation: circle-blur-expand ${durationSec}s ease forwards;
          z-index: 2;
        }
        @keyframes circle-blur-expand {
          from {
            clip-path: circle(0px at ${x}px ${y}px);
            filter: blur(4px);
          }
          60% {
            filter: blur(2px);
          }
          to {
            clip-path: circle(${maxDist}px at ${x}px ${y}px);
            filter: blur(0px);
          }
        }
      `;
      break;
    }
  }
}

/** Clean up injected transition styles */
function cleanupTransitionStyles() {
  const style = document.getElementById('theme-transition-styles');
  if (style) style.remove();
}

/**
 * Start a theme transition with the View Transitions API.
 *
 * @param updateFn - Function that performs the actual theme swap (e.g. classList changes)
 * @param options - Animation variant and timing
 */
export function startThemeTransition(updateFn: () => void, options?: ThemeTransitionOptions) {
  // Respect reduced motion preference
  if (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    updateFn();
    return;
  }

  if (!supportsViewTransitions()) {
    updateFn();
    return;
  }

  const variant = options?.variant ?? 'circle';
  const duration = options?.duration ?? 400;

  injectTransitionStyles(variant, duration, options?.origin);

  const transition = (
    document as { startViewTransition: (cb: () => void) => { finished: Promise<void> } }
  ).startViewTransition(updateFn);

  transition.finished.then(cleanupTransitionStyles).catch(cleanupTransitionStyles);
}

/**
 * React hook for theme transitions.
 *
 * @returns transition function and feature detection flag
 */
export function useThemeTransition() {
  const supported = useMemo(() => supportsViewTransitions(), []);

  const transition = useCallback((updateFn: () => void, options?: ThemeTransitionOptions) => {
    startThemeTransition(updateFn, options);
  }, []);

  return { transition, supportsViewTransitions: supported };
}
