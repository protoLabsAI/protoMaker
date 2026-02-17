/**
 * Theme bridge for CopilotKit
 *
 * CopilotKit v1.51 uses standard Tailwind CSS 4 variables (--primary, --background, etc.)
 * which our design system already provides. This bridge only sets sidebar-specific overrides
 * and ensures CopilotKit's internal styles integrate cleanly with our theme.
 */

import type { CSSProperties } from 'react';

/**
 * Returns CSS properties applied to the CopilotSidebar wrapper div.
 * Sets the sidebar width and any CopilotKit-specific overrides.
 */
export function getCopilotKitThemeStyles(): CSSProperties {
  return {
    // CopilotKit sidebar width (default is 480px)
    '--sidebar-width': '420px',
  } as CSSProperties;
}
