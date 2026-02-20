import { useAppStore } from '@/store/app-store';
import { useThemeStore } from '@/store/theme-store';
import { useThemePreview } from './use-theme-preview';

/**
 * Hook that manages project theme state and preview handlers
 */
export function useProjectTheme() {
  // Get theme-related values from theme store
  const { theme: globalTheme, setTheme, setPreviewTheme } = useThemeStore();
  // Project-specific theme setter stays on app-store (cross-domain)
  const { setProjectTheme } = useAppStore();

  // Get debounced preview handlers
  const { handlePreviewEnter, handlePreviewLeave } = useThemePreview({ setPreviewTheme });

  return {
    // Theme state
    globalTheme,
    setTheme,
    setProjectTheme,
    setPreviewTheme,

    // Preview handlers
    handlePreviewEnter,
    handlePreviewLeave,
  };
}
