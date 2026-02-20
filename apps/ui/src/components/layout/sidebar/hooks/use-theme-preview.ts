import { useRef, useCallback, useEffect } from 'react';
import type { ThemeMode } from '@/store/types';

interface UseThemePreviewProps {
  setPreviewTheme: (theme: ThemeMode | null) => void;
}

export function useThemePreview({ setPreviewTheme }: UseThemePreviewProps) {
  // Debounced preview theme handlers to prevent excessive re-renders
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePreviewEnter = useCallback(
    (value: string) => {
      // Clear any pending timeout
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current);
      }
      // Small delay to debounce rapid hover changes
      previewTimeoutRef.current = setTimeout(() => {
        setPreviewTheme(value as ThemeMode);
      }, 16); // ~1 frame delay
    },
    [setPreviewTheme]
  );

  const handlePreviewLeave = useCallback(
    (e: React.PointerEvent) => {
      const relatedTarget = e.relatedTarget as HTMLElement;
      if (!relatedTarget?.closest('[data-testid^="project-theme-"]')) {
        // Clear any pending timeout
        if (previewTimeoutRef.current) {
          clearTimeout(previewTimeoutRef.current);
        }
        setPreviewTheme(null);
      }
    },
    [setPreviewTheme]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current);
      }
    };
  }, []);

  return {
    handlePreviewEnter,
    handlePreviewLeave,
  };
}
