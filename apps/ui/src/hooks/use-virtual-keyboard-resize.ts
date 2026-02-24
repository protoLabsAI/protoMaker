/**
 * Virtual Keyboard Resize Hook
 *
 * Handles the iOS/Android quirk where the virtual keyboard changes the viewport height,
 * causing jarring re-layouts. Uses the VisualViewport API to detect keyboard appearance
 * and sets a CSS custom property (--visual-viewport-height) that can be used instead of
 * 100vh in layouts.
 *
 * This ensures the kanban board, terminal, and other full-height layouts maintain their
 * position when the keyboard appears, rather than being pushed up or squished.
 */

import { useEffect } from 'react';

/**
 * Hook to manage virtual keyboard resize behavior on mobile devices
 * Sets --visual-viewport-height CSS variable on :root
 *
 * @param enabled - Whether to activate the keyboard resize behavior (typically useIsMobile())
 */
export function useVirtualKeyboardResize(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Check if VisualViewport API is available
    if (typeof window === 'undefined' || !window.visualViewport) {
      return;
    }

    const updateViewportHeight = () => {
      if (!window.visualViewport) return;

      // Set CSS custom property to the actual visual viewport height
      // This is different from window.innerHeight when the keyboard is shown
      const height = window.visualViewport.height;
      document.documentElement.style.setProperty('--visual-viewport-height', `${height}px`);
    };

    // Set initial value
    updateViewportHeight();

    // Listen for resize events (keyboard show/hide)
    window.visualViewport.addEventListener('resize', updateViewportHeight);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateViewportHeight);
      }
      // Clean up the CSS variable
      document.documentElement.style.removeProperty('--visual-viewport-height');
    };
  }, [enabled]);
}
