/**
 * Mobile Visibility Hook
 *
 * Overrides React Query's default focus manager to prevent excessive API refetches
 * when users switch between apps on mobile. Only triggers refetch if the app has been
 * backgrounded for more than 30 seconds.
 *
 * This addresses the mobile browser quirk where window focus events fire on every
 * app switch, causing a burst of API requests that can impact performance and data usage.
 */

import { useEffect } from 'react';
import { focusManager } from '@tanstack/react-query';

const REFETCH_THRESHOLD_MS = 30 * 1000; // 30 seconds

/**
 * Hook to manage mobile visibility behavior for React Query
 * Prevents refetch spam when switching apps on mobile devices
 *
 * @param enabled - Whether to activate the custom visibility behavior (typically useIsMobile())
 */
export function useMobileVisibility(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    let lastHiddenTime: number | null = null;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // App is being backgrounded - record timestamp
        lastHiddenTime = Date.now();
      } else if (document.visibilityState === 'visible') {
        // App is coming back to foreground
        const now = Date.now();
        const wasBackgroundedLongEnough =
          lastHiddenTime !== null && now - lastHiddenTime >= REFETCH_THRESHOLD_MS;

        if (wasBackgroundedLongEnough) {
          // Been away for 30+ seconds - trigger refetch
          focusManager.setFocused(true);
        }
        // else: Been away for < 30s - don't trigger refetch
      }
    };

    // Override the focus manager with our custom visibility listener
    focusManager.setEventListener((_handleFocus) => {
      // Set up our custom visibility change handler
      document.addEventListener('visibilitychange', handleVisibilityChange);

      // Return cleanup function
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    });

    return () => {
      // Restore default focus manager behavior on cleanup
      focusManager.setEventListener((_handleFocus) => {
        if (typeof window === 'undefined' || !window.addEventListener) {
          return;
        }

        const listener = () => _handleFocus();
        window.addEventListener('focus', listener, false);
        window.addEventListener('visibilitychange', listener, false);

        return () => {
          window.removeEventListener('focus', listener);
          window.removeEventListener('visibilitychange', listener);
        };
      });
    };
  }, [enabled]);
}
